import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

interface BenchmarkResult {
  database: string;
  operation: string;
  duration: number;
  latency: number;
  success: boolean;
  error?: string;
}

class DatabaseBenchmark {
  private results: BenchmarkResult[] = [];
  private neonConfig: string;

  constructor(
    private neonClient: any,
    private supabaseClient: any,
    private mongoClient: MongoClient
  ) {
    this.neonConfig = process.env.NEON_DATABASE_URL!;
  }

  async measureOperation(
    database: string,
    operation: string,
    fn: () => Promise<any>
  ): Promise<void> {
    const start = Date.now();
    try {
      await fn();
      const duration = Date.now() - start;
      this.results.push({
        database,
        operation,
        duration,
        latency: duration,
        success: true
      });
    } catch (error) {
      this.results.push({
        database,
        operation,
        duration: Date.now() - start,
        latency: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async runWriteTest(): Promise<void> {
    const testData = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      title: `Test Post ${i}`,
      content: `Content for post ${i}`,
      user_id: Math.floor(Math.random() * 100),
      created_at: new Date(),
      updated_at: new Date()
    }));

    // Neon Write Test
    await this.measureOperation('Neon', 'Write 10k rows', async () => {
      const sql = this.neonClient;
      for (const item of testData) {
        await sql`INSERT INTO posts (id, title, content, user_id, created_at, updated_at) 
                 VALUES (${item.id}, ${item.title}, ${item.content}, ${item.user_id}, ${item.created_at}, ${item.updated_at})`;
      }
    });

    // Supabase Write Test
    await this.measureOperation('Supabase', 'Write 10k rows', async () => {
      const { error } = await this.supabaseClient
        .from('posts')
        .insert(testData);
      if (error) throw error;
    });

    // MongoDB Write Test
    await this.measureOperation('MongoDB', 'Write 10k rows', async () => {
      const collection = this.mongoClient.db('test').collection('posts');
      await collection.insertMany(testData);
    });
  }

  async runReadTest(): Promise<void> {
    // Simple Query Test
    await this.measureOperation('Neon', 'Simple Query', async () => {
      const sql = this.neonClient;
      await sql`SELECT * FROM posts WHERE user_id = 1 LIMIT 10`;
    });

    await this.measureOperation('Supabase', 'Simple Query', async () => {
      const { error } = await this.supabaseClient
        .from('posts')
        .select('*')
        .eq('user_id', 1)
        .limit(10);
      if (error) throw error;
    });

    await this.measureOperation('MongoDB', 'Simple Query', async () => {
      const collection = this.mongoClient.db('test').collection('posts');
      await collection.find({ user_id: 1 }).limit(10).toArray();
    });

    // Complex Query Test
    await this.measureOperation('Neon', 'Complex Query', async () => {
      const sql = this.neonClient;
      await sql`
        SELECT p.*, u.username as author_name, 
               COUNT(c.id) as comment_count,
               COUNT(l.id) as like_count
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN comments c ON p.id = c.post_id
        LEFT JOIN post_likes l ON p.id = l.post_id
        WHERE p.created_at > ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}
        GROUP BY p.id, u.username
        ORDER BY p.created_at DESC
        LIMIT 20
      `;
    });

    await this.measureOperation('Supabase', 'Complex Query', async () => {
      const { error } = await this.supabaseClient
        .from('posts')
        .select(`
          *,
          users!inner(username),
          comments(count),
          post_likes(count)
        `)
        .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
    });

    await this.measureOperation('MongoDB', 'Complex Query', async () => {
      const collection = this.mongoClient.db('test').collection('posts');
      await collection.aggregate([
        {
          $match: {
            created_at: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: 'id',
            as: 'author'
          }
        },
        {
          $lookup: {
            from: 'comments',
            localField: 'id',
            foreignField: 'post_id',
            as: 'comments'
          }
        },
        {
          $lookup: {
            from: 'post_likes',
            localField: 'id',
            foreignField: 'post_id',
            as: 'likes'
          }
        },
        {
          $project: {
            _id: 1,
            title: 1,
            content: 1,
            created_at: 1,
            author_name: { $arrayElemAt: ['$author.username', 0] },
            comment_count: { $size: '$comments' },
            like_count: { $size: '$likes' }
          }
        },
        { $sort: { created_at: -1 } },
        { $limit: 20 }
      ]).toArray();
    });
  }

  async runColdStartTest(): Promise<void> {
    // Simulate cold start by creating new connections
    await this.measureOperation('Neon', 'Cold Start', async () => {
      const coldClient = neon(this.neonConfig);
      await coldClient`SELECT 1`;
    });

    await this.measureOperation('MongoDB', 'Cold Start', async () => {
      const coldClient = new MongoClient(process.env.MONGODB_URI!);
      await coldClient.connect();
      const collection = coldClient.db('test').collection('posts');
      await collection.findOne({});
      await coldClient.close();
    });
  }

  printResults(): void {
    console.log('\nBenchmark Results:');
    console.log('=================');
    
    const groupedResults = this.results.reduce((acc, result) => {
      const key = `${result.database}-${result.operation}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(result);
      return acc;
    }, {} as Record<string, BenchmarkResult[]>);

    Object.entries(groupedResults).forEach(([key, results]) => {
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      const successRate = (results.filter(r => r.success).length / results.length) * 100;
      console.log(`\n${key}:`);
      console.log(`  Average Duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`  Success Rate: ${successRate.toFixed(2)}%`);
      if (successRate < 100) {
        console.log('  Errors:', results.filter(r => !r.success).map(r => r.error));
      }
    });
  }

  private async setupDatabase() {
    try {
      // Read schema from samples directory
      const schema = await fs.readFile('samples/blog-schema.sql', 'utf-8');
      
      // Execute schema for Neon
      await this.neonClient.query(schema);
      console.log('Neon schema created successfully');

      // Execute schema for Supabase
      await this.supabaseClient.query(schema);
      console.log('Supabase schema created successfully');

      // MongoDB schema is handled through the schema generator
      console.log('MongoDB schema created successfully');
    } catch (error) {
      console.error('Error setting up database:', error);
      throw error;
    }
  }
}

async function main() {
  // Initialize database connections
  const neonClient = neon(process.env.NEON_DATABASE_URL!);
  const supabaseClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );
  const mongoClient = new MongoClient(process.env.MONGODB_URI!);

  try {
    await mongoClient.connect();
    const benchmark = new DatabaseBenchmark(neonClient, supabaseClient, mongoClient);

    console.log('Running write tests...');
    await benchmark.runWriteTest();

    console.log('Running read tests...');
    await benchmark.runReadTest();

    console.log('Running cold start tests...');
    await benchmark.runColdStartTest();

    benchmark.printResults();
  } catch (error) {
    console.error('Benchmark failed:', error);
  } finally {
    await mongoClient.close();
  }
}

main().catch(console.error); 