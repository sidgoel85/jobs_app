// Multi-agent architecture using @langchain/langgraph-swarm

import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createSwarm, createHandoffTool } from "@langchain/langgraph-swarm";
import { HumanMessage } from "@langchain/core/messages";

import ResumeScrape from "./ResumeScrape.js";
import JobSearch from "./JobSearch.js";

export class SwarmWorkflow {
  private jobSearch: JobSearch;
  private resumeScrape: ResumeScrape;
  private model: ChatOpenAI;
  private app: any;

  constructor() {
    this.initializeEnvironment();
    this.jobSearch = new JobSearch();
    this.resumeScrape = new ResumeScrape();
    this.model = new ChatOpenAI({ modelName: "gpt-4o" });
    this.app = this.initializeWorkflow();
  }

  private initializeEnvironment(): void {
    process.env.LANGSMITH_PROJECT = "job-it";
  }

  private createResumeScrapeTool() {
    // @ts-ignore
    return tool(
      async (args: { question: string }) => {
        try {
          console.log("🔍 Processing resume analysis request...");

          if (!args.question || args.question.trim().length === 0) {
            throw new Error("No question provided for resume analysis");
          }

          const resumeScrapeGraph = await this.resumeScrape.setGraph();
          const result = await resumeScrapeGraph.invoke({
            question: args.question,
          });

          if (!result || !result.answer) {
            throw new Error("No response received from resume analysis");
          }

          console.log("✅ Resume analysis completed successfully");
          return result.answer;
        } catch (error: any) {
          console.error("❌ Resume analysis tool failed:", error.message);
          return `I apologize, but I encountered an issue while analyzing your resume: ${error.message}. Please ensure your resume file is accessible and try again.`;
        }
      },
      {
        name: "resume_scrape",
        description:
          "Search and analyze resume content to answer based on user prompt.",
        schema: z.object({
          question: z.string().describe("The question to ask about the resume"),
        }),
      }
    );
  }

  private createJobSearchTool() {
    // @ts-ignore
    return tool(
      async (args: { skills: string[] }) => {
        try {
          console.log("🔍 Processing job search request...");

          if (
            !args.skills ||
            !Array.isArray(args.skills) ||
            args.skills.length === 0
          ) {
            throw new Error("No skills provided for job search");
          }

          const primarySkill = args.skills[0];
          if (!primarySkill || primarySkill.trim().length === 0) {
            throw new Error("Invalid skill provided for job search");
          }

          const jobSearchGraph = await this.jobSearch.setGraph();
          const searchQuery = `Find top 10 jobs for ${primarySkill} based in Atlanta,GA USA that were opened in the past 30 days on LinkedIn. Return the result in the list format`;

          const result = await jobSearchGraph.invoke({
            messages: [new HumanMessage(searchQuery)],
          });

          if (!result || !result.messages || result.messages.length === 0) {
            throw new Error("No job search results received");
          }

          console.log("✅ Job search completed successfully");
          return result.messages[result.messages.length - 1].content;
        } catch (error: any) {
          console.error("❌ Job search tool failed:", error.message);
          return `I apologize, but I encountered an issue while searching for jobs: ${error.message}. Please check your internet connection and API keys, then try again.`;
        }
      },
      {
        name: "job_search",
        description: "Find relevant jobs based on skills.",
        schema: z.object({
          skills: z.array(z.string()).describe("List of skills"),
        }),
      }
    );
  }

  private initializeWorkflow() {
    const resumeScrapeTool = this.createResumeScrapeTool();
    const jobSearchTool = this.createJobSearchTool();

    // @ts-ignore
    const resumeScrapeAgent = createReactAgent({
      llm: this.model,
      // @ts-ignore
      tools: [resumeScrapeTool, createHandoffTool({agentName: "JobSearchAgent", description: "Transfer user to the job-search agent that can search for jobs based on skills."})],
      name: "ResumeScrapeAgent",
      prompt:
        "You are a resume analysis agent. Use the resume_scrape tool to answer questions about the resume content, skills, experience, and qualifications.",
    });

    // @ts-ignore
    const jobSearchAgent = createReactAgent({
      llm: this.model,
      tools: [jobSearchTool],
      name: "JobSearchAgent",
      prompt:
        "You are a job search agent. Use the job_search tool to find relevant jobs based on skills returned by resume scrape agent.",
    });

    const checkpointer = new MemorySaver();
    const workflow = createSwarm({
      agents: [resumeScrapeAgent, jobSearchAgent],
      defaultActiveAgent: "ResumeScrapeAgent",
    });

    return workflow.compile({ checkpointer });
  }

  public getApp() {
    return this.app;
  }

  public async runJobSearchWorkflow() {
    try {
      console.log("🚀 Starting job search workflow...");

      const config = { configurable: { thread_id: "1" } };

      // Step 1: Resume Analysis
      console.log("📄 Analyzing resume to extract skills...");
      let resumeScrapeResponse;

      try {
        resumeScrapeResponse = await this.app.invoke(
          {
            messages: [
              new HumanMessage(
                "Look through my resume and return top 3 skills in the list format."
              ),
            ],
          },
          config
        );

        if (!resumeScrapeResponse?.messages?.length) {
          throw new Error("No response received from resume analysis");
        }

        console.log(
          "✅ Resume analysis completed:",
          resumeScrapeResponse.messages[
            resumeScrapeResponse.messages.length - 1
          ].content
        );
      } catch (error: any) {
        console.error("❌ Resume analysis failed:", error.message);
        throw new Error(
          `Failed to analyze resume: ${
            error.message || "Unknown error occurred"
          }`
        );
      }

      // Step 2: Job Search
      console.log("🔍 Searching for relevant jobs...");

      try {
        const jobAgentResponse = await this.app.invoke(
          {
            messages: [
              new HumanMessage(
                `Find jobs for ${
                  resumeScrapeResponse.messages[
                    resumeScrapeResponse.messages.length - 1
                  ].content
                }.`
              ),
            ],
          },
          config
        );

        if (!jobAgentResponse?.messages?.length) {
          throw new Error("No response received from job search");
        }

        console.log("✅ Job search completed:");
        console.log(
          jobAgentResponse.messages[jobAgentResponse.messages.length - 1]
            .content
        );

        return {
          success: true,
          resumeSkills:
            resumeScrapeResponse.messages[
              resumeScrapeResponse.messages.length - 1
            ].content,
          jobResults:
            jobAgentResponse.messages[jobAgentResponse.messages.length - 1]
              .content,
        };
      } catch (error: any) {
        console.error("❌ Job search failed:", error.message);
        throw new Error(
          `Failed to search for jobs: ${
            error.message || "Unknown error occurred"
          }`
        );
      }
    } catch (error: any) {
      console.error("💥 Workflow failed:", error.message);

      return {
        success: false,
        error:
          "We encountered an issue while processing your request. Please check your resume file and try again. If the problem persists, please contact support.",
        details: error.message,
      };
    }
  }
}

// Create and export instance
//const swarmWorkflow = new SwarmWorkflow();
//export const app = swarmWorkflow.getApp();

// Execute the workflow if this file is run directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   swarmWorkflow
//     .runJobSearchWorkflow()
//     .then((result) => {
//       if (result.success) {
//         console.log("🎉 Workflow completed successfully!", result);
//       } else {
//         console.log("⚠️ Workflow completed with errors:", result.error);
//       }
//     })
//     .catch((error) => {
//       console.error("💥 Critical error:", error.message);
//       process.exit(1);
//     });
// }
