import React, { useState } from 'react';
import { DatabaseType } from '../types';

interface RagQueryFormProps {
  onSubmit: (query: string, dbType: DatabaseType, compareAll?: boolean) => Promise<void>;
  isLoading: boolean;
  databases: DatabaseType[];
  activeDatabase: DatabaseType;
  setActiveDatabase: (db: DatabaseType) => void;
}

const RagQueryForm: React.FC<RagQueryFormProps> = ({ 
  onSubmit,
  isLoading,
  databases,
  activeDatabase,
  setActiveDatabase
}) => {
  const [query, setQuery] = useState('');
  const [compareAllDbs, setCompareAllDbs] = useState(false);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    onSubmit(query, activeDatabase, compareAllDbs);
  };
  
  return (
    <div className="border rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold mb-3">RAG Query</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ask a question about the uploaded document:
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your query about the document..."
            className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            disabled={isLoading}
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select vector database:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {databases.map((db) => (
              <button
                key={db}
                type="button"
                className={`py-2 px-3 rounded-md text-sm ${
                  db === activeDatabase
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
                onClick={() => setActiveDatabase(db)}
                disabled={isLoading}
              >
                <span className="capitalize">{db}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="compare-all"
            checked={compareAllDbs}
            onChange={(e) => setCompareAllDbs(e.target.checked)}
            disabled={isLoading}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="compare-all" className="ml-2 block text-sm text-gray-700">
            Compare performance across all databases
          </label>
        </div>
        
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className={`w-full py-2 px-4 rounded-md text-white font-medium ${
            !query.trim() || isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing Query...
            </div>
          ) : compareAllDbs ? (
            'Compare All Databases'
          ) : (
            `Query Using ${activeDatabase.toUpperCase()}`
          )}
        </button>
      </form>
    </div>
  );
};

export default RagQueryForm;