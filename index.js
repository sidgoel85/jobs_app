import { OpenAI } from "@langchain/openai";
import { DynamicTool } from "@langchain/community/tools/dynamic";
import { AWSLambda } from "@langchain/community/tools/aws_lambda";
import { Calculator } from "langchain/tools/calculator" ;
import { AgentExecutor, createReactAgent } from "langchain/agents";
import {PromptTemplate} from "@langchain/core/prompts";
import { RetrievalQAChain, loadQAStuffChain } from "langchain/chains";
import { DocxLoader } from "langchain/document_loaders/fs/docx";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { pull } from "langchain/hub";
import { StructuredOutputParser } from "langchain/output_parsers";


//export const handler = async(event) => {

// const parser = StructuredOutputParser.fromNamesAndDescriptions({
//   answer : "answer to user's question"
// });

// const formatInstructions = parser.getFormatInstructions();

  const model = new OpenAI({ 
    modelName: "gpt-3.5-turbo",
    temperature: 0,
    openAIApiKey: "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"
   });


  const resumeScanTool = new DynamicTool({
    name : "ResumeScanTool",
    description : "Invoke this to scan the doc and return the response user is looking",
    func : async(inputDoc) => {
        console.log("doc is", inputDoc);
        const loader = new DocxLoader(
            inputDoc
          );
          
        const docs = await loader.load();
        
        const embeddings = new OpenAIEmbeddings({
            openAIApiKey: "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", // In Node.js defaults to process.env.OPENAI_API_KEY
            batchSize: 512, // Default value if omitted is 512. Max is 2048
            modelName: "text-embedding-3-large",
          });
        
         const vectorSaveStore = await FaissStore.fromDocuments(docs, embeddings);
        
         await vectorSaveStore.save("./");
        
         const vectorLoadStore = await FaissStore.load("./", embeddings);
        
        const chain = new RetrievalQAChain({combineDocumentsChain : loadQAStuffChain(model),
                                            retriever: vectorLoadStore.asRetriever(),
                                            returnSourceDocuments: true
        }); 
        
        const docRes = await chain.invoke({
            query : "Return the top 3 key skills?"
        });
        
        return docRes.text;
    }
  });

  const jobApiTool = new AWSLambda({
    name: "job-api",
  // tell the Agent precisely what the tool does
    description:
      "Given the top 3 skills , please return the list of latest jobs matching those skills",
    region: "us-east-1", 
    accessKeyId: "AKIARBMP2SWFEDFMTH2E", 
    secretAccessKey: "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",
    functionName: "job-test-api"
});

const tools = [resumeScanTool, jobApiTool, new Calculator()];

const prompt = await pull("hwchase17/react");

const reactResumePrompt = new PromptTemplate({
  inputVariables: ["docToScan"],
  template: "Return the array of all the latest jobs baesd on top skills for {docToScan}?"
  //partialVariables : {format_instructions : formatInstructions}
});

const reactAgent = await createReactAgent({llm : model, tools, prompt});

// const reactAgentExec = new AgentExecutor({agent: reactAgent,tools, verbose: true}); 

const reactAgentExec = new AgentExecutor({agent: reactAgent,tools}); 

const resumeScanRes = await reactAgentExec.invoke({input : await reactResumePrompt.formatPromptValue({docToScan : "./Goel_Siddharth.docx"})});

console.log("res is", JSON.parse(resumeScanRes.output));

//}








// const jobApiTool = new AWSLambda({
//   name: "job-api",
//   // tell the Agent precisely what the tool does
//   description:
//     "Return the list of jobs",
//   region: "us-east-1", 
//   accessKeyId: "AKIARBMP2SWFEDFMTH2E", 
//   secretAccessKey: "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",
//   functionName: "job-test-api"
// });

// const res = await jobApiTool.invoke({input : resumeScanRes.output});
// console.log(res);


