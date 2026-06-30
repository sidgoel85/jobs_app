import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import serverless from "serverless-http";
import { SwarmWorkflow } from "./Swarm";

// Create an MCP server
const server = new McpServer({
  name: "job-server",
  version: "1.0.0"
});

// Add an addition tool
server.registerTool("jobs",
  {
    title: "Jobs Tool",
    description: "Return the list of jobs",
    inputSchema: { message: z.string().describe("User prompt") },
  },
  async ({ message }) => {
    const swarm = new SwarmWorkflow();
    const res = await swarm.runJobSearchWorkflow();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(res)
        }
      ]
    };
  }
);

const app = express();
app.use(express.json());

//Function to get a new server instance
app.post('/mcp', async (req: any, res: any) => {
  // In stateless mode, create a new instance of transport and server for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.

  console.log('Received MCP POST request', req.path, req.body);
  
  try {
    //const server = getServer(); 
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

//Function to get a new server instance
app.get(['/', '/mcp'], async (req: any, res: any) => {
  
  console.log('Received MCP GET request', req.path, req.body);
  
  try {
    //const server = getServer(); 
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

//region Code for local testing
  // const PORT = 3000;
  // // Start the server
  // app.listen(PORT, () => {
  //     console.log(`Job MCP Server running on HTTP at http://localhost:${PORT}`);
  // });

  // process.on('SIGINT', async () => {
  //   console.log('Shutting down server...');
  //   // Close all active transports
  //   // for (const sessionId in transports) {
  //   //   try {
  //   //     console.log(`Closing transport for session ${sessionId}`);
  //   //     await transports[sessionId].close();
  //   //     delete transports[sessionId];
  //   //   } catch (error) {
  //   //     console.error(`Error closing transport for session ${sessionId}:`, error);
  //   //   }
  //   // }
  //   console.log('Server shutdown complete');
  //   process.exit(0);
  // });

//#endregion

const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {

  console.log('Received event:', JSON.stringify(event, null, 2));

  return serverlessHandler(event, context);

  // TODO implement
  // const response = {
  //   statusCode: 200,
  //   body: JSON.stringify('Hello from Lambda!'),
  // };
  // return response;
};




