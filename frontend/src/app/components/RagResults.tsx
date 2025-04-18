import React from 'react';
import { DocumentResult, ComparisonResult } from '../types';

interface RagResultsProps {
  comparisonResult: ComparisonResult;
}

const RagResults: React.FC<RagResultsProps> = ({ comparisonResult }) => {
  if (!comparisonResult) return null;
  
  return (
    <div className="border rounded-lg p-4 mt-4">
      <h3 className="text-lg font-semibold mb-3">Query Performance Results</h3>
      
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-1">Query:</h4>
        <p className="text-sm bg-white p-2 rounded-md border border-gray-200">{comparisonResult.query}</p>
      </div>
      
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Database Performance:</h4>
        <div className="overflow-hidden bg-white rounded-md border border-gray-200">
          {Object.entries(comparisonResult.responses)
            .sort(([_, respA], [__, respB]) => respA.query_time - respB.query_time)
            .map(([db, response], index, array) => (
              <div 
                key={db} 
                className={`flex justify-between px-3 py-2 border-b last:border-b-0 text-sm ${
                  db === comparisonResult.fastest ? 'font-medium text-green-700 bg-green-50' : ''
                }`}
              >
                <span className="capitalize">
                  {db === comparisonResult.fastest && '✓ '}
                  {db}
                </span>
                <div className="flex items-center">
                  <span className="mr-4">{response.retrieved_docs.length} docs</span>
                  <span>{response.query_time.toFixed(4)}s</span>
                </div>
              </div>
            ))}
        </div>
      </div>
      
      {comparisonResult.fastest && (
        <div className="text-sm text-gray-500">
          Best performance: <span className="font-medium capitalize">{comparisonResult.fastest}</span>
        </div>
      )}
    </div>
  );
};

export default RagResults;