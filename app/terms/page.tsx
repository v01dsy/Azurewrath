// app/terms/page.tsx

export default function TermsPage() {
  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-[#0066ff] via-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent">
          Terms of Service
        </h1>
        <p className="text-slate-400 text-sm mb-10">Last updated: March 1, 2026</p>

        <div className="space-y-8 text-slate-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using azurewrath.lol (the "Site"), you agree to be bound by these Terms of
              Service. If you do not agree to these terms, please do not use the Site.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
            <p>
              Azurewrath is a third-party Roblox limited item tracking platform. We provide inventory
              tracking, RAP history, price analytics, and watchlist notifications. We are not affiliated
              with, endorsed by, or sponsored by Roblox Corporation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Eligibility</h2>
            <p>
              You must be at least 13 years of age to use this Site, in accordance with Roblox's own
              Terms of Service. By using the Site, you represent that you meet this requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. User Accounts</h2>
            <p>
              Accounts are authenticated via your Roblox account. You are responsible for maintaining
              the security of your account. We reserve the right to suspend or terminate accounts that
              violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Acceptable Use</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Use the Site for any unlawful purpose.</li>
              <li>Attempt to scrape, reverse engineer, or abuse the Site's APIs.</li>
              <li>Interfere with or disrupt the Site's infrastructure.</li>
              <li>Impersonate other users or staff members.</li>
              <li>Use the Site to harass, threaten, or harm other users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Accuracy</h2>
            <p>
              All item data, RAP values, and price information displayed on the Site is sourced from
              third-party APIs and may not always be accurate or up to date. We make no guarantees
              about the accuracy of this data and it should not be used as the sole basis for trading
              decisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Intellectual Property</h2>
            <p>
              All Roblox item names, images, and related content are the property of Roblox Corporation.
              The Site's design, code, and original content are the property of Azurewrath. You may not
              reproduce or redistribute Site content without permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Disclaimers</h2>
            <p>
              The Site is provided "as is" without warranties of any kind. We are not responsible for
              any losses, damages, or trading decisions made based on information provided by the Site.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your access to the Site at any time, for any
              reason, without notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of the Site after changes constitutes
              acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Contact</h2>
            <p>
              For questions about these Terms, contact us at{' '}
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