"use client";

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Message as MessageType, UploadResponse, RagResponse, DatabaseType, ComparisonResult } from './types';
import Message from './components/Message';
import DocumentUpload from './components/DocumentUpload';
import AsyncDocumentUpload from './components/AsyncDocumentUpload';
import ChatInput from './components/ChatInput';
import RagResults from './components/RagResults';
import RagQueryForm from './components/RagQueryForm';
import DatabasePerformance from './components/DatabasePerformance';

export default function Home() {
  // Chat-related states
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [availableDatabases, setAvailableDatabases] = useState<DatabaseType[]>(['faiss', 'chroma']);

  // RAG-related states
  const [uploadStatus, setUploadStatus] = useState<UploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<string>('');
  const [activeDatabase, setActiveDatabase] = useState<DatabaseType>('faiss');
  const [ragResponses, setRagResponses] = useState<Record<DatabaseType, RagResponse | null>>({
    faiss: null,
    chroma: null,
    weaviate: null,
    mongo: null,
    pgvector: null,
    milvus: null
  });
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  
  // Tab management
  const [activeTab, setActiveTab] = useState<'chat' | 'rag'>('chat');
  
  // Use async RPC interface
  const [useAsyncInterface, setUseAsyncInterface] = useState<boolean>(true);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchAvailableDatabases = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/available-dbs');
      if (response.data.success) {
        const availableDBs = response.data.available_databases;
        setAvailableDatabases(availableDBs);
        
        // Set active database to the first available one if current is not available
        if (availableDBs.length > 0 && !availableDBs.includes(activeDatabase)) {
          setActiveDatabase(availableDBs[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching available databases:', error);
    }
  };

  useEffect(() => {
    fetchAvailableDatabases();
  }, []);
  
  const handleSendMessage = async (messageText: string) => {
    // Add user message to chat
    const userMessage: MessageType = { text: messageText, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Send message to backend
      const response = await axios.post('http://localhost:5000/api/chat', {
        message: messageText
      });

      // Add bot response to chat
      if (response.data.success) {
        const botMessage: MessageType = {
          text: response.data.response,
          sender: 'bot'
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        const errorMessage: MessageType = {
          text: `Error: ${response.data.error || 'Unknown error'}`,
          sender: 'bot'
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: MessageType = {
        text: 'Sorry, there was an error processing your request.',
        sender: 'bot'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle document upload completion
  const handleUploadComplete = (response: UploadResponse) => {
    setUploadStatus(response);
    
    // Find fastest database
    const times = response.document.indexing_times;
    const availableDbs = Object.keys(times).filter(db => times[db as keyof typeof times] >= 0) as DatabaseType[];
    
    const fastest = Object.entries(times)
      .filter(([_, time]) => time >= 0)
      .reduce(
        (fastest, [db, time]) => time < fastest.time ? {db, time} : fastest,
        { db: 'none', time: Infinity }
      );
    
    // Update available databases based on upload response
    if (response.document.available_dbs) {
      const newAvailableDbs = Object.entries(response.document.available_dbs)
        .filter(([_, isAvailable]) => isAvailable)
        .map(([db]) => db as DatabaseType);
      
      setAvailableDatabases(newAvailableDbs);
    }
    
    // Generate indexing time message
    const indexingTimesMessage = availableDbs
      .map(db => `- ${db.toUpperCase()}: ${times[db].toFixed(4)}s`)
      .join('\n');
    
    setMessages(prev => [
      ...prev,
      {
        text: `Successfully uploaded document: ${response.document.filename}.\nThe document has been indexed in all available vector databases.\n\nIndexing times:\n\n${indexingTimesMessage}\n\nFastest database: ${fastest.db.toUpperCase()} (${fastest.time.toFixed(4)}s)\n\nYou can now ask questions about this document using the RAG query interface.`,
        sender: 'bot'
      }
    ]);
  };

  // Handle RAG query submission for a single database
  const handleRagQuery = async (query: string, dbType: DatabaseType, compareAll: boolean = false) => {
    setIsQuerying(true);
    setCurrentQuery(query);
    
    // Add query to message history with appropriate text based on compareAll
    setMessages(prev => [
      ...prev,
      {
        text: compareAll 
          ? `Comparing all databases for query: ${query}` 
          : `Query using ${dbType.toUpperCase()}: ${query}`,
        sender: 'user'
      }
    ]);

    try {
      // Use the compare_all parameter in the API request
      const response = await axios.post<RagResponse>('http://localhost:5000/api/rag', {
        query,
        db_type: dbType,
        compare_all: compareAll
      });

      if (response.data.success) {
        if (compareAll && response.data.compare_all) {
          // Handle comparison results
          const results = response.data.results;
          const bestDb = response.data.best_db;
          
          if (!results) {
            setMessages(prev => [
              ...prev,
              {
                text: `No results found in any database.`,
                sender: 'bot'
              }
            ]);
            return;
          }
          
          // Format performance comparison message
          let dbComparison = "Database Comparison Results:\n";
          
          // Track fastest DB for display
          let fastestDb: string | null = null;
          let fastestTime = Infinity;
          
          // First pass: Find the fastest database
          Object.entries(results).forEach(([db, result]) => {
            if (result.query_time && result.retrieved_docs && result.retrieved_docs.length > 0) {
              if (result.query_time < fastestTime) {
                fastestDb = db;
                fastestTime = result.query_time;
              }
            }
          });
          
          // Second pass: Format the comparison message
          Object.entries(results).forEach(([db, result]) => {
            if (result.query_time) {
              const docCount = result.retrieved_docs ? result.retrieved_docs.length : 0;
              const isFastest = db === fastestDb;
              dbComparison += `- ${db.toUpperCase()}: ${result.query_time.toFixed(4)}s, ${docCount} docs${isFastest ? ' (fastest)' : ''}\n`;
            } else {
              dbComparison += `- ${db.toUpperCase()}: Error or no results\n`;
            }
          });
          
          // Set combined message with results and comparison
          setMessages(prev => [
            ...prev,
            {
              text: `${response.data.rag_response}\n\n${dbComparison}`,
              sender: 'bot'
            }
          ]);
          
          // Store all responses for later viewing
          const comparisonResult: ComparisonResult = {
            query,
            responses: {} as Record<DatabaseType, RagResponse>,
            fastest: fastestDb as unknown as DatabaseType | null
          };
          
          // Convert database results to full RagResponses for the comparison view
          Object.entries(results).forEach(([db, result]) => {
            comparisonResult.responses[db as DatabaseType] = {
              success: true,
              query,
              db_type: db,
              query_time: result.query_time || 0,
              rag_response: response.data.rag_response,
              retrieved_docs: result.retrieved_docs || []
            };
          });
          
          setComparisonResult(comparisonResult);
        } else {
          // Handle normal response from a single database
          setMessages(prev => [
            ...prev,
            {
              text: response.data.rag_response,
              sender: 'bot'
            }
          ]);
          
          // Store the response for this database
          setRagResponses(prev => ({
            ...prev,
            [dbType]: response.data
          }));
        }
      } else {
        setMessages(prev => [
          ...prev,
          {
            text: `Error: ${response.data.message || 'Unknown error'}`,
            sender: 'bot'
          }
        ]);
      }
    } catch (error: any) {
      console.error('RAG query error:', error);
      setMessages(prev => [
        ...prev,
        {
          text: error.response?.data?.message || 'Error processing your query',
          sender: 'bot'
        }
      ]);
    } finally {
      setIsQuerying(false);
    }
  };
  
  // Toggle between sync and async interfaces
  const toggleInterface = () => {
    setUseAsyncInterface(!useAsyncInterface);
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-white">
      <div className="container mx-auto p-4 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Gemini Chatbot with Vector Database RAG</h1>
          <p className="text-gray-600">Chat with Gemini or ask questions about uploaded documents using various vector databases.</p>
        </div>
        
        {/* Interface selector */}
        <div className="mb-4 flex items-center">
          <span className="mr-2 text-sm font-medium">Interface:</span>
          <button 
            onClick={toggleInterface}
            className="px-3 py-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition"
          >
            {useAsyncInterface ? 'Using Async RPC' : 'Using REST API'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b mb-6">
          <button
            className={`py-2 px-4 ${
              activeTab === 'chat'
                ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-blue-500'
            }`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={`py-2 px-4 ${
              activeTab === 'rag'
                ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
                : 'text-gray-600 hover:text-blue-500'
            }`}
            onClick={() => setActiveTab('rag')}
          >
            RAG Query
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main content area */}
          <div className="md:col-span-2 h-[calc(100vh-240px)] flex flex-col">
            {/* Chat messages */}
            <div className="flex-grow overflow-y-auto bg-white rounded-lg p-4 mb-4 border border-gray-200">
              {messages.map((message, index) => (
                <Message key={index} message={message} />
              ))}
              <div ref={messagesEndRef} />
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-center space-x-2 text-gray-500 mt-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                  <span className="text-sm">Gemini is thinking...</span>
                </div>
              )}
            </div>
            
            {/* Input area */}
            <div>
              <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
              <p className="text-xs text-gray-500 mt-1">
                Send a message to chat with Gemini, or switch to the RAG tab to ask questions about documents.
              </p>
            </div>
          </div>
          
          {/* Sidebar */}
          <div className="md:col-span-1">
            {activeTab === 'chat' ? (
              // Show document upload in chat tab
              <>
                {useAsyncInterface ? (
                  <AsyncDocumentUpload 
                    onUploadComplete={handleUploadComplete}
                    isUploading={isUploading}
                    setIsUploading={setIsUploading}
                    setAvailableDatabases={setAvailableDatabases}
                  />
                ) : (
                  <DocumentUpload 
                    onUploadComplete={handleUploadComplete}
                    isUploading={isUploading}
                    setIsUploading={setIsUploading}
                    setAvailableDatabases={setAvailableDatabases}
                  />
                )}
                
                {/* Add Performance Dashboard */}
                {uploadStatus && (
                  <div className="mt-6">
                    <DatabasePerformance 
                      indexingTimes={uploadStatus.document.indexing_times}
                      queryTimes={Object.entries(ragResponses)
                        .filter(([_, response]) => response !== null)
                        .reduce((acc, [db, response]) => ({
                          ...acc,
                          [db]: response ? response.query_time : 0
                        }), {})}
                    />
                  </div>
                )}
              </>
            ) : (
              // Show RAG query form in RAG tab
              <>
                <RagQueryForm 
                  onSubmit={handleRagQuery}
                  isLoading={isQuerying}
                  databases={availableDatabases}
                  activeDatabase={activeDatabase}
                  setActiveDatabase={setActiveDatabase}
                />
                
                {comparisonResult && (
                  <RagResults 
                    comparisonResult={comparisonResult}
                  />
                )}
                
                {/* Add Performance Dashboard in RAG tab too */}
                {uploadStatus && (
                  <div className="mt-6">
                    <DatabasePerformance 
                      indexingTimes={uploadStatus.document.indexing_times}
                      queryTimes={Object.entries(ragResponses)
                        .filter(([_, response]) => response !== null)
                        .reduce((acc, [db, response]) => ({
                          ...acc,
                          [db]: response ? response.query_time : 0
                        }), {})}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}