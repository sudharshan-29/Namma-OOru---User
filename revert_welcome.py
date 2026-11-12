import re

with open('index.html', 'r') as f:
    content = f.read()

# 1. Replace HTML
pattern_html = r'<!-- CINEMATIC WELCOME SCREEN OVERLAY -->.*?<\/section>'
replacement_html = """<!-- CINEMATIC WELCOME SCREEN OVERLAY -->
    <section id="welcome-screen" class="welcome-screen" aria-label="NAMMA OORU Citizen Intelligence">
      <img src="./start.png" alt="Start Dashboard" class="start-bg-img" />
    </section>"""
content = re.sub(pattern_html, replacement_html, content, flags=re.DOTALL)

# 2. Replace CSS
pattern_css = r'\.welcome-screen \{.*?(?=\/\* =========================================================\n\s*CIVIC INTELLIGENCE DASHBOARD MODAL)'
replacement_css = """
      .welcome-screen {
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
      .start-bg-img {
        width: 100vw;
        height: 100vh;
        object-fit: cover;
        filter: blur(1.5px); /* very very light blur */
        transform: scale(1.02); /* prevent blur edges from showing background */
      }
      .welcome-screen.dismissed {
        transform: translateY(-100%);
        opacity: 0;
        pointer-events: none;
      }

"""
content = re.sub(pattern_css, replacement_css, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)

print("Reverted to start.png with light blur.")
