// IMPORTANT - Add your API keys here. Be careful not to publish them.
process.env.OPENAI_API_KEY = "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";
process.env.TAVILY_API_KEY = "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";
process.env.GROQ_API_KEY = "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";
process.env.GOOGLE_API_KEY = "AIzaSyAB4apEdvYcjQF14pv76EfVAc17OyPiRW0"

import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { StateGraph, Annotation } from "@langchain/langgraph";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { pull } from "langchain/hub";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";

import { fileURLToPath } from 'url';
import { dirname } from 'path';

export default class ResumeScrape {

  constructor() {
  }

  private InputStateAnnotation = Annotation.Root({
    question: Annotation<string>,
  });

  private StateAnnotation = Annotation.Root({
    question: Annotation<string>,
    context: Annotation<Document[]>,
    answer: Annotation<string>,
  });

  public async getModel() {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not configured");
      }

      const model = new ChatOpenAI({ modelName: "gpt-4o" });
      return model;
    } catch (error: any) {
      console.error("❌ Failed to initialize AI model:", error.message);
      throw new Error(`Unable to initialize AI service: ${error.message}`);
    }
  }

  public async generateDocSplits() {
    try {

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // const resumePath = "../job-it-server/Rupali_Singhal_Resume.docx";

      const resumePath = `${__dirname}/Rupali_Singhal_Resume.docx`;

      console.log("📄 Loading resume document...");
      const loader = new DocxLoader(resumePath);
      
      const docs = await loader.load();
      
      if (!docs || docs.length === 0) {
        throw new Error("No content found in resume document");
      }
      
      if (!docs[0].pageContent || docs[0].pageContent.trim().length === 0) {
        throw new Error("Resume document appears to be empty");
      }
    
      console.log(`✅ Resume loaded successfully. Total characters: ${docs[0].pageContent.length}`);
    
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000, 
        chunkOverlap: 200
      });
      
      const allSplits = await splitter.splitDocuments(docs);
      
      if (!allSplits || allSplits.length === 0) {
        throw new Error("Failed to process resume content");
      }
      
      console.log(`✅ Resume processed into ${allSplits.length} sections`);
      return allSplits;
      
    } catch (error: any) {
      console.error("❌ Failed to process resume document:", error.message);
      
      if (error.message.includes("ENOENT") || error.message.includes("no such file")) {
        throw new Error("Resume file not found. Please ensure the resume file exists at the specified location.");
      } else if (error.message.includes("permission")) {
        throw new Error("Unable to access resume file. Please check file permissions.");
      } else {
        throw new Error(`Unable to process resume: ${error.message}`);
      }
    }
  }

  public async setupVectorStore() { 
    try {
      console.log("🔍 Setting up resume search system...");
      
      const allSplits = await this.generateDocSplits();
      
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required for embeddings");
      }
      
      const embeddings = new OpenAIEmbeddings({
        model: "text-embedding-3-large"
      });
    
      const vectorStore = new MemoryVectorStore(embeddings);
    
      await vectorStore.addDocuments(allSplits);
      
      console.log("✅ Resume search system ready");
      return vectorStore;
      
    } catch (error: any) {
      console.error("❌ Failed to setup resume search system:", error.message);
      throw new Error(`Unable to prepare resume for analysis: ${error.message}`);
    }
  }
    
  public async retrieve(state: typeof this.InputStateAnnotation.State) {
    try {
      if (!state.question || state.question.trim().length === 0) {
        throw new Error("No question provided for resume analysis");
      }

      console.log("🔍 Searching resume for relevant information...");
      
      const vectorStore = await this.setupVectorStore();
      const retrievedDocs = await vectorStore.similaritySearch(state.question);
      
      if (!retrievedDocs || retrievedDocs.length === 0) {
        console.warn("⚠️ No relevant information found in resume");
        return { context: [] };
      }
      
      console.log(`✅ Found ${retrievedDocs.length} relevant sections in resume`);
      return { context: retrievedDocs };
      
    } catch (error: any) {
      console.error("❌ Failed to search resume:", error.message);
      throw new Error(`Unable to analyze resume content: ${error.message}`);
    }
  }

  public async generate(state: typeof this.StateAnnotation.State) {
    try {
      if (!state.question || state.question.trim().length === 0) {
        throw new Error("No question provided for analysis");
      }

      console.log("🤖 Generating response based on resume content...");
      
      if (!state.context || state.context.length === 0) {
        return { 
          answer: "I couldn't find specific information in your resume to answer that question. Please try rephrasing your question or ensure your resume contains relevant details." 
        };
      }

      const docsContent = state.context.map(doc => doc.pageContent).join("\n");
      
      if (!docsContent.trim()) {
        throw new Error("No content available for analysis");
      }

      const promptTemplate = await pull<ChatPromptTemplate>("rlm/rag-prompt"); 
      const messages = await promptTemplate.invoke({ 
        question: state.question, 
        context: docsContent 
      });

      const model = await this.getModel();
      const response = await model.invoke(messages);
      
      if (!response || !response.content) {
        throw new Error("No response generated from AI model");
      }

      console.log("✅ Response generated successfully");
      return { answer: response.content };

    } catch (error: any) {
      console.error("❌ Failed to generate response:", error.message);
      
      return { 
        answer: `I apologize, but I encountered an issue while analyzing your resume: ${error.message}. Please try again or contact support if the problem persists.` 
      };
    }
  }

  public async setGraph() {
    try {
      console.log("🔧 Setting up resume analysis workflow...");
      
      // Test that we can access the resume file before creating the workflow
      await this.generateDocSplits();
      
      const workflow = new StateGraph(this.StateAnnotation)
      .addNode("retrieve", this.retrieve.bind(this))
      .addNode("generate", this.generate.bind(this))
      .addEdge("__start__", "retrieve") // __start__ is a special name for the entrypoint
      .addEdge("retrieve", "generate")
      .addEdge("generate", "__end__")
      
      // Finally, we compile it into a LangChain Runnable.
      const resumeScrapeAgent = workflow.compile();

      console.log("✅ Resume analysis workflow setup completed");
      return resumeScrapeAgent;
      
    } catch (error: any) {
      console.error("❌ Failed to setup resume analysis workflow:", error.message);
      throw new Error(`Unable to initialize resume analysis system: ${error.message}. Please check your resume file and API keys.`);
    }
  }
}

// Initialize resume scrape with error handling
async function initializeResumeScrape() {
    try {
        const graph = new ResumeScrape();
        await graph.setGraph();
        console.log("✅ ResumeScrape module initialized successfully");
    } catch (error: any) {
        console.error("❌ Failed to initialize ResumeScrape module:", error.message);
    }
}

// Only run initialization if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    initializeResumeScrape();
}


