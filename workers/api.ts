import { neon } from '@neondatabase/serverless';

interface Env {
  NEON_DATABASE_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Initialize Neon client
    const sql = neon(env.NEON_DATABASE_URL);

    try {
      // Handle different routes
      switch (path) {
        case '/api/items':
          if (method === 'GET') {
            // Get items with pagination
            const page = parseInt(url.searchParams.get('page') || '1');
            const limit = parseInt(url.searchParams.get('limit') || '10');
            const offset = (page - 1) * limit;

            const items = await sql`
              SELECT * FROM items
              ORDER BY created_at DESC
              LIMIT ${limit}
              OFFSET ${offset}
            `;

            return new Response(JSON.stringify(items), {
              headers: { 'Content-Type': 'application/json' }
            });
          }

          if (method === 'POST') {
            // Create new item
            const body = await request.json();
            const { name, description } = body;

            const result = await sql`
              INSERT INTO items (name, description, created_at)
              VALUES (${name}, ${description}, NOW())
              RETURNING *
            `;

            return new Response(JSON.stringify(result[0]), {
              status: 201,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          break;

        case '/api/items/search':
          if (method === 'GET') {
            // Search items
            const query = url.searchParams.get('q') || '';
            
            const items = await sql`
              SELECT * FROM items
              WHERE name ILIKE ${`%${query}%`}
              OR description ILIKE ${`%${query}%`}
              ORDER BY created_at DESC
              LIMIT 10
            `;

            return new Response(JSON.stringify(items), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
          break;

        default:
          return new Response('Not Found', { status: 404 });
      }

      return new Response('Method Not Allowed', { status: 405 });
    } catch (error) {
      console.error('API Error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal Server Error' }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
}; 