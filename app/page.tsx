export default function Home() {
  return (
    <div className="space-y-12">
      <section className="text-center space-y-4">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-neon-blue via-neon-purple to-neon-magenta bg-clip-text text-transparent">
          Roblox Limited Trading Engine
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Track real-time price data for Roblox Limited items with minute-by-minute precision. 
          Avoid rate limits with our intelligent data worker.
        </p>
      </section>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-azure-500/10 to-transparent border border-azure-500/20 rounded-lg p-6">
          <div className="text-3xl mb-3">📊</div>
          <h3 className="text-xl font-semibold mb-2">Live Dashboard</h3>
          <p className="text-slate-400">
            View all Limited items with sortable price data, trends, and demand ratings.
          </p>
        </div>

        <div className="bg-gradient-to-br from-neon-purple/10 to-transparent border border-neon-purple/20 rounded-lg p-6">
          <div className="text-3xl mb-3">📈</div>
          <h3 className="text-xl font-semibold mb-2">Price Graphs</h3>
          <p className="text-slate-400">
            Interactive Recharts graphs showing 7-day, 30-day, and historical price trends.
          </p>
        </div>

        <div className="bg-gradient-to-br from-neon-magenta/10 to-transparent border border-neon-magenta/20 rounded-lg p-6">
          <div className="text-3xl mb-3">⚡</div>
          <h3 className="text-xl font-semibold mb-2">Smart Scraper</h3>
          <p className="text-slate-400">
            Python worker with throttling and proxy rotation to avoid Roblox rate limits.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Getting Started</h2>
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-3">
          <p className="text-sm"># Start the database</p>
          <code className="block bg-slate-900 p-3 rounded text-neon-blue text-sm">
            docker-compose up -d
          </code>
          
          <p className="text-sm mt-4"># Install dependencies &amp; run Next.js</p>
          <code className="block bg-slate-900 p-3 rounded text-neon-blue text-sm">
            npm install && npm run db:push && npm run dev
          </code>
          
          <p className="text-sm mt-4"># Launch Python worker</p>
          <code className="block bg-slate-900 p-3 rounded text-neon-blue text-sm">
            cd worker && python3 main.py
          </code>
        </div>
      </section>
    </div>
  );
}
