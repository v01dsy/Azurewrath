'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface SearchResult {
  id: string;
  assetId: string;
  name: string;
  imageUrl?: string;
  priceHistory?: Array<{
    price: number;
    rap?: number;
    lowestResale?: number;
  }>;
}

export default function SearchMenu() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch search results
  useEffect(() => {
    const debounceTimer = setTimeout(async () => {
      if (query.trim().length > 0) {
        setIsLoading(true);
        try {
          const response = await axios.get('/api/items/search', {
            params: { q: query },
          });
          setResults(response.data);
          setSelectedIndex(-1);
        } catch (error) {
          console.error('Search error:', error);
          setResults([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Enter' && query.trim()) setIsOpen(true);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSelectResult = (item: SearchResult) => {
    router.push(`/items/${item.assetId}`);
    setQuery('');
    setIsOpen(false);
  };

  const currentPrice = results[0]?.priceHistory?.[0]?.lowestResale
    ?? results[0]?.priceHistory?.[0]?.price;

  return (
    <div ref={searchRef} className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => query && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search for Roblox Limited items... (e.g., 'Valkyrie', 'Domino')"
          className="w-full px-4 py-3 bg-slate-800 border border-neon-blue/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-neon-blue focus:ring-1 focus:ring-neon-blue/50 transition"
        />
        
        {isLoading && (
          <div className="absolute right-4 top-3.5 animate-spin">
            ⚙️
          </div>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-neon-blue/30 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50 backdrop-blur-sm">
          {results.length > 0 ? (
            <ul className="divide-y divide-slate-700">
              {results.map((item, index) => (
                <li
                  key={item.id}
                  onClick={() => handleSelectResult(item)}
                  className={`px-4 py-3 cursor-pointer transition ${
                    index === selectedIndex
                      ? 'bg-neon-blue/20 border-l-2 border-neon-blue'
                      : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={item.imageUrl
                        ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=100&height=100&format=png`}
                      alt={item.name}
                      className="w-10 h-10 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">
                        {item.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        Asset ID: {item.assetId}
                      </p>
                      {item.priceHistory?.[0] && (
                        <p className="text-sm text-neon-blue mt-1">
                          Price: {(item.priceHistory[0].lowestResale ?? item.priceHistory[0].price).toLocaleString()} Robux
                          {item.priceHistory[0].rap && (
                            <span className="text-slate-400 ml-2">
                              (RAP: {item.priceHistory[0].rap.toLocaleString()})
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-slate-400">
              <p>No items found matching "{query}"</p>
              <p className="text-xs mt-2">Try searching with the item name or asset ID</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
