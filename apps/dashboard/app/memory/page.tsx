'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Database, Clock, Link, ChevronRight, Brain, Code, User, Folder, Video, Filter, TrendingUp } from 'lucide-react'

interface MemoryResult {
  id: string
  content: string
  bank: string
  bankInfo: {
    id: string
    name: string
    icon: string
    description: string
  }
  relevance: number
  metadata?: any
  related?: MemoryResult[]
}

interface SearchResponse {
  query: string
  totalResults: number
  results: MemoryResult[]
  searchTime: number
}

interface BankStats {
  id: string
  name: string
  icon: string
  description: string
  totalMemories: number
  recentActivity: string | null
  topKeywords: string[]
  status: string
}

const BANK_ICONS: Record<string, any> = {
  'code': Code,
  'chat-history': User,
  'documents': Folder,
  'conversations': Video,
  'general': Brain
}

export default function MemorySearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MemoryResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBank, setSelectedBank] = useState<string>('all')
  const [stats, setStats] = useState<BankStats[]>([])
  const [selectedMemory, setSelectedMemory] = useState<MemoryResult | null>(null)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [searchTime, setSearchTime] = useState(0)

  // Load memory stats on mount
  useEffect(() => {
    fetchStats()
    // Load search history from localStorage
    const history = localStorage.getItem('memorySearchHistory')
    if (history) {
      setSearchHistory(JSON.parse(history).slice(0, 5))
    }
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:8742/api/memory/stats')
      const data = await response.json()
      setStats(data.banks || [])
    } catch (error) {
      console.error('Failed to fetch memory stats:', error)
    }
  }

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery || query
    if (!q.trim()) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: q.trim(),
        limit: '20'
      })
      
      if (selectedBank !== 'all') {
        params.append('bank', selectedBank)
      }

      const response = await fetch(`http://localhost:8742/api/memory/search?${params}`)
      const data = await response.json()
      
      // Handle both SearchResponse format and the API's actual response format
      setResults(data.results || data || [])
      setTotalResults(data.totalResults || data.results?.length || 0)
      setSearchTime(data.searchTime ? Date.now() - data.searchTime : 0)
      
      // Update search history
      const newHistory = [q, ...searchHistory.filter(h => h !== q)].slice(0, 5)
      setSearchHistory(newHistory)
      localStorage.setItem('memorySearchHistory', JSON.stringify(newHistory))
      
    } catch (error) {
      console.error('Search failed:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query, selectedBank, searchHistory])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`
    return date.toLocaleDateString()
  }

  const highlightQuery = (text: string) => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-[#ffd33d]/20 text-[#ffd33d] font-semibold">{part}</mark>
        : part
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117]">
      {/* GitHub-like Header */}
      <header className="border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-[#58a6ff]" />
              <span className="text-xl font-semibold text-[#e6edf3]">
                Memory Search
              </span>
            </div>
            
            {/* Search Bar */}
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#7d8590]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Search semantic memory..."
                  className="w-full pl-10 pr-4 py-2 rounded-md bg-[#161b22] border border-[#30363d] text-[#e6edf3] placeholder-[#7d8590] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent text-sm"
                  autoFocus
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#7d8590] hover:text-[#e6edf3]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => handleSearch()}
              className="px-4 py-2 bg-[#238636] text-white rounded-md hover:bg-[#2ea043] transition-colors text-sm font-medium"
            >
              Search
            </button>
          </div>

          {/* Bank Filters */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#7d8590]">Filter:</span>
            <button
              onClick={() => setSelectedBank('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                selectedBank === 'all' 
                  ? 'bg-[#0969da] text-white' 
                  : 'bg-[#21262d] text-[#7d8590] hover:text-[#e6edf3] border border-[#30363d]'
              }`}
            >
              All Banks
            </button>
            {stats.map(bank => {
              const Icon = BANK_ICONS[bank.id] || Database
              return (
                <button
                  key={bank.id}
                  onClick={() => setSelectedBank(bank.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                    selectedBank === bank.id 
                      ? 'bg-[#0969da] text-white' 
                      : 'bg-[#21262d] text-[#7d8590] hover:text-[#e6edf3] border border-[#30363d]'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {bank.name}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Main Content */}
        <div className="flex-1">
          {/* Search Suggestions */}
          {!loading && results.length === 0 && !query && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-md p-6">
              <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">Recent Searches</h2>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((term, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuery(term)
                      handleSearch(term)
                    }}
                    className="inline-flex items-center px-3 py-1.5 bg-[#21262d] border border-[#30363d] rounded-md text-xs text-[#7d8590] hover:text-[#e6edf3] hover:border-[#58a6ff]/30 transition-colors"
                  >
                    <Clock className="h-3 w-3 mr-1.5" />
                    {term}
                  </button>
                ))}
              </div>

              <h2 className="text-sm font-semibold text-[#e6edf3] mt-6 mb-4">Memory Banks</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stats.map(bank => {
                  const Icon = BANK_ICONS[bank.id] || Database
                  return (
                    <div
                      key={bank.id}
                      className="bg-[#0d1117] border border-[#30363d] rounded-md p-4 hover:border-[#58a6ff]/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedBank(bank.id)}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-6 w-6 text-[#58a6ff]" />
                        <div className="flex-1">
                          <h3 className="font-medium text-[#e6edf3] text-sm">{bank.name}</h3>
                          <p className="text-xs text-[#7d8590] mt-1">{bank.description}</p>
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-[#7d8590]">
                            <span>{bank.totalMemories} memories</span>
                            <span>• Active {formatTimestamp(bank.recentActivity)}</span>
                          </div>
                          {bank.topKeywords.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {bank.topKeywords.slice(0, 5).map((keyword, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#1c2128] border border-[#30363d] text-[10px] text-[#7d8590]"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#58a6ff] border-t-transparent"></div>
            </div>
          )}

          {/* Search Results */}
          {!loading && results.length > 0 && (
            <div>
              <div className="text-xs text-[#7d8590] mb-4">
                About {totalResults} results ({(searchTime / 1000).toFixed(2)} seconds)
              </div>
              
              <div className="space-y-3">
                {results.map((result) => {
                  const Icon = BANK_ICONS[result.bank] || Database
                  return (
                    <div
                      key={result.id}
                      className="bg-[#161b22] border border-[#30363d] rounded-md p-4 hover:border-[#58a6ff]/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedMemory(result)}
                    >
                      {/* Memory Header */}
                      <div className="flex items-start gap-3">
                        <Icon className="h-4 w-4 text-[#7d8590] mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#0969da]/10 border border-[#0969da]/20 text-[11px] text-[#58a6ff] font-medium">
                              {result.bankInfo?.name || result.bank}
                            </span>
                            <span className="text-[11px] text-[#7d8590]">
                              Relevance: {(result.relevance * 100).toFixed(0)}%
                            </span>
                          </div>
                          
                          {/* Content Preview */}
                          <div className="text-sm text-[#e6edf3]">
                            {highlightQuery(result.content.substring(0, 200))}
                            {result.content.length > 200 && '...'}
                          </div>
                          
                          {/* Metadata */}
                          {result.metadata && (
                            <div className="mt-2 flex items-center gap-3 text-[11px] text-[#7d8590]">
                              {result.metadata.timestamp && (
                                <span>Embedded {formatTimestamp(result.metadata.timestamp)}</span>
                              )}
                              {result.metadata.source && (
                                <span>• Source: {result.metadata.source}</span>
                              )}
                              {result.metadata.username && (
                                <span>• User: {result.metadata.username}</span>
                              )}
                            </div>
                          )}
                          
                          {/* Related Memories */}
                          {result.related && result.related.length > 0 && (
                            <div className="mt-3 pl-3 border-l-2 border-[#30363d]">
                              <div className="text-[11px] text-[#7d8590] mb-1">Related memories:</div>
                              {result.related.map((related, i) => (
                                <div
                                  key={i}
                                  className="text-xs text-[#58a6ff] hover:underline cursor-pointer flex items-center gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedMemory(related)
                                  }}
                                >
                                  <Link className="h-3 w-3" />
                                  {related.content.substring(0, 60)}...
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* No Results */}
          {!loading && query && results.length === 0 && (
            <div className="text-center py-20">
              <Brain className="h-12 w-12 text-[#30363d] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-[#e6edf3] mb-2">No memories found</h2>
              <p className="text-sm text-[#7d8590]">
                Try different keywords or search in a different memory bank
              </p>
            </div>
          )}
        </div>

        {/* Sidebar - Memory Details */}
        {selectedMemory && (
          <div className="w-96 bg-[#161b22] border border-[#30363d] rounded-md p-6 h-fit sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#e6edf3]">Memory Details</h2>
              <button
                onClick={() => setSelectedMemory(null)}
                className="text-[#7d8590] hover:text-[#e6edf3] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="text-[11px] text-[#7d8590] uppercase tracking-wide mb-1">Memory Bank</div>
                <div className="flex items-center gap-2 text-sm text-[#e6edf3]">
                  {(() => {
                    const Icon = BANK_ICONS[selectedMemory.bank] || Database
                    return (
                      <>
                        <Icon className="h-4 w-4 text-[#58a6ff]" />
                        <span>{selectedMemory.bankInfo?.name || selectedMemory.bank}</span>
                      </>
                    )
                  })()}
                </div>
              </div>
              
              <div>
                <div className="text-[11px] text-[#7d8590] uppercase tracking-wide mb-1">Full Content</div>
                <div className="text-xs text-[#e6edf3] bg-[#0d1117] border border-[#30363d] p-3 rounded-md max-h-64 overflow-y-auto scrollbar-github">
                  {selectedMemory.content}
                </div>
              </div>
              
              {selectedMemory.metadata && (
                <div>
                  <div className="text-[11px] text-[#7d8590] uppercase tracking-wide mb-1">Metadata</div>
                  <div className="text-xs space-y-1">
                    {Object.entries(selectedMemory.metadata).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-[#7d8590]">{key}:</span>
                        <span className="text-[#e6edf3]">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedMemory.related && selectedMemory.related.length > 0 && (
                <div>
                  <div className="text-[11px] text-[#7d8590] uppercase tracking-wide mb-1">Related Memories</div>
                  <div className="space-y-2">
                    {selectedMemory.related.map((related, i) => (
                      <div
                        key={i}
                        className="text-xs p-2 bg-[#0d1117] border border-[#30363d] rounded-md cursor-pointer hover:border-[#58a6ff]/30 transition-colors text-[#e6edf3]"
                        onClick={() => setSelectedMemory(related)}
                      >
                        {related.content.substring(0, 100)}...
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}