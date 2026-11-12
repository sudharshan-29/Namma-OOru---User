import re

with open('index.html', 'r') as f:
    content = f.read()

# Replace the welcome-screen section
pattern = r'<!-- CINEMATIC WELCOME SCREEN OVERLAY.*?<\/section>'
replacement = """<!-- CINEMATIC WELCOME SCREEN OVERLAY -->
    <section id="welcome-screen" class="welcome-screen">
      <!-- Blurred Background -->
      <div class="welcome-bg-container">
        <img src="/dashboard-bg-hd.jpg" class="welcome-bg-img" alt="Chennai Background" />
        <div class="welcome-bg-overlay"></div>
      </div>

      <!-- Navbar -->
      <header class="welcome-navbar">
        <div class="welcome-logo">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#00e5ff">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <span class="logo-text-white">NAMMA</span> <span class="logo-text-cyan">OORU</span>
        </div>
        <nav class="welcome-nav-center">
          <a href="#" class="nav-item active">Home</a>
          <a href="#" class="nav-item">Report</a>
          <a href="#" class="nav-item">Explore</a>
          <a href="#" class="nav-item">Dashboard</a>
          <a href="#" class="nav-item">About</a>
        </nav>
        <div class="welcome-nav-right">
          <button class="btn-nav-report">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            Report an Issue
          </button>
        </div>
      </header>

      <!-- Hero Content -->
      <div class="welcome-hero-content">
        <div class="hero-pill">A CLEANER, SAFER CHENNAI TOGETHER</div>
        <h1 class="hero-title">
          See the issues.<br/>
          <span class="text-cyan">Understand the city.</span><br/>
          Enable action.
        </h1>
        <p class="hero-paragraph">
          NAMMA OORU is a map-driven civic intelligence platform<br/>
          that helps citizens report local street problems and enables<br/>
          administrators to turn real data into real change.
        </p>
        <div class="hero-actions">
          <button class="btn-primary" id="btn-welcome-hero-report">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            Report an Issue &rarr;
          </button>
          <button class="btn-secondary" id="btn-welcome-explore">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 20l-6-3V4l6 3m0 13l6-3m-6 3V7m6 10l6 3V7l-6-3m0 13V4"/></svg>
            Explore the Map
          </button>
        </div>
      </div>
    </section>"""

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(new_content)

print("Replaced welcome screen.")
