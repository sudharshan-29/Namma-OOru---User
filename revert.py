import re

with open('index.html', 'r') as f:
    content = f.read()

# 1. Revert CSS
css_pattern = r'\.welcome-screen\s*\{.*?(?=\.welcome-screen\.dismissed\s*\{)'
css_replacement = """.welcome-screen {
        position: fixed;
        inset: 0;
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #050a14;
        overflow: hidden;
        user-select: none;
        transition: transform 0.75s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease;
        will-change: transform, opacity;
      }
      
      """
content = re.sub(css_pattern, css_replacement, content, flags=re.DOTALL)

# 2. Revert HTML
html_pattern = r'<!-- CINEMATIC WELCOME SCREEN OVERLAY -->\s*<section id="welcome-screen" class="welcome-screen">.*?</section>'
html_replacement = """<!-- START DASHBOARD OVERLAY -->
    <section id="welcome-screen" class="welcome-screen" aria-label="NAMMA OORU Citizen Intelligence">
      <img src="./start.png" alt="Start Dashboard" style="width: 100vw; height: 100vh; object-fit: cover;" />
    </section>"""
content = re.sub(html_pattern, html_replacement, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)

print("Reverted to start.png")
