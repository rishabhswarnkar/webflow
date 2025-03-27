import { Groq } from "groq-sdk";
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

interface SchemaField {
  name: string;
  type: string;
  constraints: string[];
  description: string;
}

interface TableSchema {
  name: string;
  fields: SchemaField[];
  relationships: string[];
  indexes: string[];
}

async function generateSchema(description: string): Promise<TableSchema[]> {
  const prompt = `
    Generate a PostgreSQL schema for the following application description:
    "${description}"
    
    IMPORTANT: Return ONLY the raw JSON without any markdown formatting or code blocks.
    The response should start with { and end with } and be in this exact format:
    {
      "tables": [
        {
          "name": "table_name",
          "fields": [
            {
              "name": "field_name",
              "type": "postgres_type",
              "constraints": ["constraint1", "constraint2"],
              "description": "field description"
            }
          ],
          "relationships": ["relationship description"],
          "indexes": ["index description"]
        }
      ]
    }

    Make sure:
    1. The output is valid JSON
    2. All arrays and objects are properly closed
    3. No trailing commas in arrays or objects
    4. All strings are properly quoted
    5. The response is complete and not truncated
  `;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: "You are a database schema expert. Generate PostgreSQL schemas based on natural language descriptions. Return ONLY raw JSON without any markdown formatting or code blocks. Ensure the JSON is complete and valid."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.1,
    max_tokens: 4096
  });

  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error('No response from Groq');
  }

  try {
    // Clean up the response
    const cleanedResponse = response
      .replace(/```[a-z]*\n|\n```/g, '') // Remove code blocks
      .replace(/\n/g, '') // Remove newlines
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    // Find the JSON object in the response
    const jsonMatch = cleanedResponse.match(/\{.*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }

    const jsonStr = jsonMatch[0];
    console.log('Cleaned JSON:', jsonStr);
    
    const schema = JSON.parse(jsonStr);
    return schema.tables;
  } catch (error) {
    console.error('Error parsing schema:', error);
    console.error('Raw response:', response);
    
    // Fallback to mock schema
    console.log('Using fallback mock schema...');
    return mockSchema;
  }
}

// Fallback mock schema
const mockSchema: TableSchema[] = [
  {
    name: "users",
    fields: [
      {
        name: "id",
        type: "SERIAL",
        constraints: ["PRIMARY KEY"],
        description: "Unique identifier for the user"
      },
      {
        name: "username",
        type: "VARCHAR(50)",
        constraints: ["NOT NULL", "UNIQUE"],
        description: "User's username"
      },
      {
        name: "email",
        type: "VARCHAR(255)",
        constraints: ["NOT NULL", "UNIQUE"],
        description: "User's email"
      },
      {
        name: "created_at",
        type: "TIMESTAMP",
        constraints: ["NOT NULL", "DEFAULT CURRENT_TIMESTAMP"],
        description: "Creation timestamp"
      }
    ],
    relationships: [],
    indexes: ["CREATE INDEX idx_users_username ON users(username);"]
  },
  {
    name: "posts",
    fields: [
      {
        name: "id",
        type: "SERIAL",
        constraints: ["PRIMARY KEY"],
        description: "Unique identifier for the post"
      },
      {
        name: "title",
        type: "VARCHAR(255)",
        constraints: ["NOT NULL"],
        description: "Post title"
      },
      {
        name: "content",
        type: "TEXT",
        constraints: ["NOT NULL"],
        description: "Post content"
      },
      {
        name: "user_id",
        type: "INTEGER",
        constraints: ["NOT NULL", "REFERENCES users(id)"],
        description: "Author ID"
      },
      {
        name: "created_at",
        type: "TIMESTAMP",
        constraints: ["NOT NULL", "DEFAULT CURRENT_TIMESTAMP"],
        description: "Creation timestamp"
      }
    ],
    relationships: ["FOREIGN KEY (user_id) REFERENCES users(id)"],
    indexes: ["CREATE INDEX idx_posts_user_id ON posts(user_id);"]
  }
];

async function generateSQL(schema: TableSchema[]): Promise<string> {
  const sqlStatements: string[] = [];

  for (const table of schema) {
    // Create table
    const fields = table.fields.map(field => {
      const constraints = field.constraints.join(' ');
      return `  ${field.name} ${field.type} ${constraints}`;
    }).join(',\n');

    sqlStatements.push(`
CREATE TABLE ${table.name} (
${fields}
);`);

    // Create indexes
    for (const index of table.indexes) {
      sqlStatements.push(index);
    }
  }

  return sqlStatements.join('\n\n');
}

async function main() {
  try {
    // Generate schema for a blog application
    const description = `
      Create a blog application with the following features:
      - Users can create posts with title, content, and tags
      - Posts can have multiple comments from users
      - Users can like posts
      - Posts can be categorized
      - Users can follow other users
      
      Requirements:
      - Use appropriate data types and constraints
      - Include indexes for common queries
      - Implement proper foreign key relationships
      - Add timestamps for created_at and updated_at
      - Include soft delete where appropriate
    `;

    console.log('Generating schema for:', description);
    const schema = await generateSchema(description);
    
    console.log('\nGenerated Schema:');
    console.log(JSON.stringify(schema, null, 2));

    console.log('\nGenerated SQL:');
    const sql = await generateSQL(schema);
    console.log(sql);

    // Save SQL to file
    const fs = require('fs');
    fs.writeFileSync('samples/blog-schema.sql', sql);
    console.log('\nSQL saved to samples/blog-schema.sql');
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error); 