import re

with open('index.html', 'r') as f:
    content = f.read()

pattern = r'\.welcome-screen \{.*?(?=\/\* =========================================================\n\s*CIVIC INTELLIGENCE DASHBOARD MODAL)'

replacement = """
      .welcome-screen {
        position: fixed;
        inset: 0;
        z-index: 999;
        display: flex;
        flex-direction: column;
        background-color: #050a14;
        overflow: hidden;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .welcome-bg-container {
        position: absolute;
        inset: 0;
        z-index: 1;
      }
      .welcome-bg-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(8px) brightness(0.65);
        transform: scale(1.05); /* hide blurred edges */
      }
      .welcome-bg-overlay {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at center, rgba(5,10,20,0.1) 0%, rgba(5,10,20,0.8) 100%);
      }
      
      .welcome-navbar {
        position: relative;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px 48px;
        width: 100%;
      }
      .welcome-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.5px;
      }
      .logo-text-white { color: #ffffff; }
      .logo-text-cyan { color: #00e5ff; }
      
      .welcome-nav-center {
        display: flex;
        align-items: center;
        gap: 32px;
      }
      .nav-item {
        color: #cbd5e1;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
        transition: color 0.2s;
        position: relative;
      }
      .nav-item:hover {
        color: #ffffff;
      }
      .nav-item.active {
        color: #ffffff;
      }
      .nav-item.active::after {
        content: '';
        position: absolute;
        bottom: -6px;
        left: 0;
        width: 100%;
        height: 2px;
        background-color: #00e5ff;
        border-radius: 2px;
      }
      
      .btn-nav-report {
        background-color: #00e5ff;
        color: #0f172a;
        border: none;
        padding: 10px 20px;
        border-radius: 9999px;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0, 229, 255, 0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .btn-nav-report:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 229, 255, 0.6);
      }
      
      .welcome-hero-content {
        position: relative;
        z-index: 10;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding-left: 10%;
        max-width: 800px;
      }
      .hero-pill {
        border: 1px solid rgba(0, 229, 255, 0.4);
        border-radius: 9999px;
        padding: 6px 16px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #e2e8f0;
        width: fit-content;
        margin-bottom: 24px;
        background: rgba(0, 229, 255, 0.05);
      }
      .hero-title {
        font-size: 72px;
        font-weight: 800;
        line-height: 1.05;
        color: #ffffff;
        margin: 0 0 24px 0;
        letter-spacing: -0.02em;
      }
      .text-cyan {
        color: #00e5ff;
      }
      .hero-paragraph {
        font-size: 20px;
        line-height: 1.6;
        color: #cbd5e1;
        margin: 0 0 48px 0;
        max-width: 650px;
        font-weight: 400;
      }
      
      .hero-actions {
        display: flex;
        gap: 20px;
        align-items: center;
      }
      .btn-primary {
        background-color: #00cbf0;
        color: #ffffff;
        border: none;
        padding: 14px 28px;
        border-radius: 9999px;
        font-size: 16px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(0, 203, 240, 0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 203, 240, 0.5);
      }
      .btn-secondary {
        background-color: rgba(255, 255, 255, 0.05);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.4);
        padding: 14px 28px;
        border-radius: 9999px;
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        backdrop-filter: blur(4px);
        transition: background-color 0.2s;
      }
      .btn-secondary:hover {
        background-color: rgba(255, 255, 255, 0.15);
      }
      
      /* Welcome screen dismiss animation */
      .welcome-screen.dismissed {
        transform: translateY(-100%);
        opacity: 0;
        pointer-events: none;
      }

"""

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(new_content)

print("Replaced CSS.")
