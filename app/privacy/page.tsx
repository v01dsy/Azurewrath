// app/privacy/page.tsx

export default function PrivacyPage() {
  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-[#0066ff] via-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent">
          Privacy Policy
        </h1>
        <p className="text-slate-400 text-sm mb-10">Last updated: March 1, 2026</p>

        <div className="space-y-8 text-slate-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Overview</h2>
            <p>
              Azurewrath (I) operates azurewrath.lol (the "Site"), a Roblox limited item
              tracking and analytics platform. This Privacy Policy explains what information I collect, how
              I use it, and your rights regarding that information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Information I Collect</h2>
            <p className="mb-3">I collect the following information when you use the Site:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><span className="text-white font-medium">Roblox Account Data</span> — Your Roblox username, display name, user ID, avatar URL, and public bio, obtained via the official Roblox API.</li>
              <li><span className="text-white font-medium">Inventory Data</span> — Your public Roblox limited item inventory, fetched via the Roblox API.</li>
              <li><span className="text-white font-medium">Discord Account Data</span> — If you choose to link your Discord account, I store your Discord user ID and username solely for notification purposes.</li>
              <li><span className="text-white font-medium">Session Data</span> — Authentication tokens stored in cookies to keep you logged in.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. How I Use Your Information</h2>
            <p className="mb-3">I use collected information to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Display your inventory, RAP values, and trading statistics on the Site.</li>
              <li>Send watchlist price change notifications via browser push or Discord DM (only if you opt in).</li>
              <li>Authenticate your identity through Roblox OAuth or bio verification.</li>
              <li>Improve the Site's features and performance.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Data Sharing</h2>
            <p>
              I do not sell, rent, or share your personal information with third parties for marketing purposes.
              Inventory and profile data displayed on the Site is sourced from Roblox's public APIs and is
              already publicly accessible on the Roblox platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Data Retention</h2>
            <p>
              I retain your data for as long as your account is active on the Site. Inventory snapshots are
              stored to power historical RAP graphs. You may request deletion of your data at any time by
              contacting me.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Cookies</h2>
            <p>
              I use a single session cookie to keep you authenticated. I do not use tracking cookies or
              third-party advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Third-Party Services</h2>
            <p>
              The Site interacts with the Roblox API and optionally Discord's API. Your use of these platforms
              is subject to their respective privacy policies. I am not affiliated with Roblox Corporation
              or Discord Inc.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal data stored on the Site. To
              exercise these rights, please contact me at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Contact</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact me at{' '}
              <a href="mailto:contact@azurewrath.lol" className="text-purple-400 hover:text-purple-300 transition">
                contact@azurewrath.lol
              </a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}