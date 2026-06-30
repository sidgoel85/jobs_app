// IMPORTANT - Add your API keys here. Be careful not to publish them.
process.env.OPENAI_API_KEY =
  "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";
process.env.TAVILY_API_KEY = "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";
process.env.GROQ_API_KEY =
  "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";

import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

export default class JobSearch {
  constructor() {}

  public getClient() {
    try {
      if (!process.env.TAVILY_API_KEY) {
        throw new Error("TAVILY_API_KEY is not configured");
      }

      const client = new MultiServerMCPClient({
        mcpServers: {
          tavily: {
            url: `https://mcp.tavily.com/mcp/?tavilyApiKey=${process.env.TAVILY_API_KEY}`,
            // command: "npx",
            // args: ["-y", "tavily-mcp@latest"],
            // env: {
            //   TAVILY_API_KEY: process.env.TAVILY_API_KEY
            // }
          },
        },
      });

      return client;
    } catch (error: any) {
      console.error("❌ Failed to initialize Tavily client:", error.message);
      throw new Error(
        `Unable to connect to job search service: ${error.message}`
      );
    }
  }

  public async getTools() {
    try {
      const client = this.getClient();
      const tools = await client.getTools();

      if (!tools || tools.length === 0) {
        throw new Error("No search tools available");
      }

      return tools;
    } catch (error: any) {
      console.error("❌ Failed to get search tools:", error.message);
      throw new Error(`Unable to access job search tools: ${error.message}`);
    }
  }

  public getModel() {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not configured");
      }

      const llm = new ChatOpenAI({
        modelName: "gpt-4o",
        temperature: 0,
        maxTokens: undefined,
        maxRetries: 2,
      });

      return llm;
    } catch (error: any) {
      console.error("❌ Failed to initialize AI model:", error.message);
      throw new Error(`Unable to initialize AI service: ${error.message}`);
    }
  }

  public async getToolNode() {
    try {
      const tools = await this.getTools();
      const toolNode = new ToolNode(tools);

      return toolNode;
    } catch (error: any) {
      console.error("❌ Failed to create tool node:", error.message);
      throw new Error(`Unable to setup job search tools: ${error.message}`);
    }
  }

  public async invokeModel(state: typeof MessagesAnnotation.State) {
    try {
      if (!state.messages || state.messages.length === 0) {
        throw new Error("No messages provided for processing");
      }

      const llm = this.getModel();
      const tools = await this.getTools();
      const llmWithTools = llm.bindTools(tools);

      const response = await llmWithTools.invoke(state.messages);

      if (!response) {
        throw new Error("No response received from AI model");
      }

      // We return a list, because this will get added to the existing list
      return { messages: [response] };
    } catch (error: any) {
      console.error("❌ Failed to process job search request:", error.message);

      // Return error message as AI response
      return {
        messages: [
          new AIMessage({
            content: `I apologize, but I encountered an issue while searching for jobs: ${error.message}. Please try again or contact support if the problem persists.`,
          }),
        ],
      };
    }
  }

  public async shouldContinue({ messages }: typeof MessagesAnnotation.State) {
    try {
      if (!messages || messages.length === 0) {
        console.error("❌ No messages to process");
        return "__end__";
      }

      const lastMessage = messages[messages.length - 1] as AIMessage;

      // If the LLM makes a tool call, then we route to the "tools" node
      if (lastMessage.tool_calls?.length) {
        lastMessage.tool_calls[0].args.topic = "general";
        return "tools";
      }
      // Otherwise, we stop (reply to the user) using the special "__end__" node
      return "__end__";
    } catch (error: any) {
      console.error("❌ Error in workflow decision:", error.message);
      return "__end__";
    }
  }

  public async setGraph() {
    try {
      console.log("🔧 Setting up job search workflow...");

      // Validate that tools are available before creating the graph
      await this.getTools();

      const jobSearchWorkflow = new StateGraph(MessagesAnnotation)
        .addNode("agent", this.invokeModel.bind(this))
        .addEdge("__start__", "agent") // __start__ is a special name for the entrypoint
        .addNode("tools", await this.getToolNode())
        .addEdge("tools", "agent")
        .addConditionalEdges("agent", this.shouldContinue.bind(this));

      // Finally, we compile it into a LangChain Runnable.
      const jobSearchAgent = jobSearchWorkflow.compile();

      console.log("✅ Job search workflow setup completed");
      return jobSearchAgent;
    } catch (error: any) {
      console.error("❌ Failed to setup job search workflow:", error.message);
      throw new Error(
        `Unable to initialize job search system: ${error.message}. Please check your API keys and try again.`
      );
    }
  }
}

// Initialize job search with error handling
async function initializeJobSearch() {
  try {
    const graph = new JobSearch();
    await graph.setGraph();
    console.log("✅ JobSearch module initialized successfully");
  } catch (error: any) {
    console.error("❌ Failed to initialize JobSearch module:", error.message);
  }
}

// Only run initialization if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeJobSearch();
}
