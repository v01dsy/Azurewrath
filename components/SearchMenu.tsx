//components/SearchMenu.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type SearchMode = 'limited' | 'player';

interface SearchResult {
  assetId: string;
  name: string;
  displayName?: string;
  imageUrl?: string;
  manipulated?: boolean;
  priceHistory?: Array<{
    price: number;
    rap?: number;
    lowestResale?: number;
  }>;
}

interface SearchMenuProps {
  mode: SearchMode;
}

export default function SearchMenu({ mode }: SearchMenuProps) {
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
          const endpoint = mode === 'player'
            ? '/api/players/search'
            : '/api/items/search';

          const response = await axios.get(endpoint, {
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
  }, [query, mode]);

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
        setSelectedIndex(prev => prev < results.length - 1 ? prev + 1 : prev);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) handleSelectResult(results[selectedIndex]);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSelectResult = (item: SearchResult) => {
    if (mode === 'player') {
      router.push(`/player/${item.assetId}`);
    } else {
      router.push(`/item/${item.assetId}`);
    }
    setQuery('');
    setIsOpen(false);
  };

  const placeholderText = mode === 'limited'
    ? "Search limited items..."
    : "Search players...";

  const noResultsText = mode === 'limited'
    ? `No items found matching "${query}"`
    : `No players found matching "${query}"`;

  const noResultsSubtext = mode === 'limited'
    ? "Try searching with the item name or asset ID"
    : "Try searching with the player's username";

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
          placeholder={placeholderText}
          className="w-full px-4 py-3 bg-slate-800 border border-neon-blue/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-neon-blue focus:ring-1 focus:ring-neon-blue/50 transition"
        />

        {isLoading && (
          <div className="absolute right-4 top-3.5 animate-spin">⚙️</div>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-neon-blue/30 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50 backdrop-blur-sm">
          {results.length > 0 ? (
            <ul className="divide-y divide-slate-700">
              {results.map((item, index) => (
                <li
                  key={item.assetId}
                  onClick={() => handleSelectResult(item)}
                  className={`px-4 py-3 cursor-pointer transition ${
                    index === selectedIndex
                      ? 'bg-neon-blue/20 border-l-2 border-neon-blue'
                      : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Thumbnail with manipulated overlay */}
                    <div className="relative flex-shrink-0">
                      <img
                        src={item.imageUrl ?? `https://www.roblox.com/asset-thumbnail/image?assetId=${item.assetId}&width=100&height=100&format=png`}
                        alt={item.name}
                        className="w-10 h-10 rounded object-cover"
                      />
                      {item.manipulated && (
                        <img
                          src="/Images/manipulated1.png"
                          alt="Manipulated"
                          title="This item's RAP may be manipulated"
                          className="absolute -top-1 -left-1 w-4 h-4"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white truncate">
                          {item.name}
                        </h3>

                      {mode === 'player' ? (
                        <>
                          {item.displayName && (
                            <p className="text-xs text-slate-400">Display Name: {item.displayName}</p>
                          )}
                          <p className="text-xs text-slate-400">User ID: {item.assetId}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-slate-400">Asset ID: {item.assetId}</p>
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
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-slate-400">
              <p>{noResultsText}</p>
              <p className="text-xs mt-2">{noResultsSubtext}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}