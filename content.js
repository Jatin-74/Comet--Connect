//Comet Relay
// Features: Deep Scrape + Smart Clean + Scroll Warning + Auto-Chunking + PII Redaction + Domain Blocking

(function() {
    
    // SAFETY CONFIGURATION
    const BLOCKED_DOMAINS = [
        "bank", "wallet", "secure", "login", "signin", "password", 
        "account", "paypal", "chase", "wells", "settings", "admin"
    ];

    // 2. Helper to check safety
    function isSensitiveSite() {
        const url = window.location.href.toLowerCase();
        return BLOCKED_DOMAINS.some(domain => url.includes(domain));
    }

    // 3. IMMEDIATE SAFETY CHECK
    if (isSensitiveSite()) {
        console.log("Comet Relay: Safety Protocol active. UI disabled on this sensitive site.");
        return; 
    }

    // STANDARD CONFIGURATION
    const CHUNK_SIZE = 10000; 
    
    const PROMPTS = {
        START: `[SYSTEM: IMPORT START]
I am pasting a large transcript in multiple parts.
INSTRUCTIONS:
1. Receive each part.
2. Do NOT reply or summarize yet.
3. Just say "✅ Part Received" and wait for the next part.
`,
        CONTINUE: `\n[SYSTEM: PART {{CURRENT}} OF {{TOTAL}}]\nContinuing transcript...\n`,
        END: `\n[SYSTEM: IMPORT FINISHED]
-- TRANSCRIPT END --

INSTRUCTIONS:
1. Reconstruct the full conversation from all parts.
2. Identify Project Goal, Constraints, and Current State.
3. Say "✅ Context Restored" and await instructions.
`
    };

    let importQueue = [];
    let currentPart = 0;
    let totalParts = 0;
    let autoFeedTimer = null;

    //  CREATE UI
    if (document.getElementById('Comet Connect')) return;
    const host = document.createElement('div');
    host.id = 'Comet Connect';
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
        <style>
            .container { 
                position: fixed; bottom: 30px; right: 30px; z-index: 2147483647; 
                display: flex; flex-direction: column; gap: 12px; font-family: -apple-system, sans-serif; 
            }
            .btn { 
                width: 60px; height: 60px; border-radius: 50%; border: none; cursor: pointer; 
                font-size: 24px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); 
                transition: transform 0.2s; display: flex; align-items: center; justify-content: center;
                background: white; position: relative; font-weight: bold; color: #333;
            }
            .btn:hover { transform: scale(1.1); box-shadow: 0 6px 20px rgba(0,0,0,0.25); }
            
            #btn-scrape { background: #ea580c; color: white; } 
            #btn-load { background: #10b981; color: white; } 
            
            /* UI States */
            .auto-mode { background: #ef4444 !important; animation: pulse 1.5s infinite; }
            @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }

            /* Tooltip */
            .btn::after {
                content: attr(data-tooltip); position: absolute; right: 75px; 
                background: #1f2937; color: white; padding: 6px 10px; border-radius: 6px; 
                font-size: 13px; opacity: 0; pointer-events: none; white-space: nowrap;
                transition: opacity 0.2s; font-weight: normal; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            .btn:hover::after { opacity: 1; }

            /* Safety Shield Icon */
            .shield { position: absolute; top: -5px; right: -5px; font-size: 14px; }
        </style>
        
        <div class="container">
            <button id="btn-scrape" class="btn" data-tooltip="Safe Export (PII Removed)">
                📡<span class="shield"></span>
            </button>
            <button id="btn-load" class="btn" data-tooltip="Import JSON">📥</button>
        </div>
        <input type="file" id="file-input" accept=".json" style="display: none;">
    `;

    const btnScrape = shadow.getElementById('btn-scrape');
    const btnLoad = shadow.getElementById('btn-load');
    const fileInput = shadow.getElementById('file-input');

    //  EXPORT LOGIC
    btnScrape.onclick = () => {
        if (isSensitiveSite()) return alert("⚠️ Security Alert: Export disabled on sensitive page.");

        const confirmScroll = confirm("⚠️ Have you scrolled to the top?\n\nIf not, old messages might be missing. Click OK to proceed.");
        if (!confirmScroll) return;

        btnScrape.innerText = "⏳";
        setTimeout(() => {
            const rawText = deepScraper();
            
  
            let cleanText = cleanTranscript(rawText);
            
         
            cleanText = redactPII(cleanText);
            
            if (cleanText.length < 50) {
                alert("⚠️ Scrape failed. No text found.");
                btnScrape.innerText = "📡";
            } else {
                downloadJSON(cleanText);
                btnScrape.innerText = "✅";
                setTimeout(() => {
                   btnScrape.innerHTML = '📡<span class="shield"></span>'; 
                }, 2000);
            }
        }, 500);
    };

    // IMPORT LOGIC
    btnLoad.onclick = () => {
        if (importQueue.length > 0) {
            clearTimeout(autoFeedTimer);
            if (confirm("Pause Auto-Import?")) {
                btnLoad.classList.remove("auto-mode");
            } else {
                processNextChunk(); 
            }
        } else {
            fileInput.click();
        }
    };
    
    fileInput.onchange = (e) => {
        if (!e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target.result);
                prepareChunks(json.content);
            } catch (err) { alert("Invalid JSON file"); }
        };
        reader.readAsText(e.target.files[0]);
        e.target.value = ''; 
    };

    function prepareChunks(text) {
        importQueue = [];
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
            importQueue.push(text.substring(i, i + CHUNK_SIZE));
        }
        
        totalParts = importQueue.length;
        currentPart = 1;

        if (totalParts > 1) {
            alert(`File is large (${text.length} chars).\nSplitting into ${totalParts} parts.\n\nThe system will auto-paste them. Don't touch the mouse!`);
            btnLoad.className = "btn auto-mode";
            processNextChunk();
        } else {
            const payload = PROMPTS.START + "\n" + text + "\n" + PROMPTS.END;
            injectText(payload);
            alert("File loaded! (Small enough to fit in one message)");
        }
    }

    function processNextChunk() {
        const chunk = importQueue.shift();
        let payload = "";

        if (currentPart === 1) payload = PROMPTS.START + "\n-- PART 1 --\n" + chunk;
        else payload = PROMPTS.CONTINUE.replace('{{CURRENT}}', currentPart).replace('{{TOTAL}}', totalParts) + chunk;

        if (importQueue.length === 0) payload += PROMPTS.END;

        injectText(payload);
        tryPressEnter();

        btnLoad.innerHTML = `${currentPart}/${totalParts}`;
        btnLoad.setAttribute('data-tooltip', `Auto-Pasting Part ${currentPart}...`);
        
        if (importQueue.length > 0) {
            currentPart++;
            autoFeedTimer = setTimeout(processNextChunk, 5000); 
        } else {
            btnLoad.className = "btn";
            btnLoad.innerHTML = "✅";
            btnLoad.setAttribute('data-tooltip', 'Done!');
            setTimeout(() => { 
                btnLoad.innerHTML = "📥"; 
                btnLoad.setAttribute('data-tooltip', 'Import JSON');
            }, 4000);
        }
    }

    // HELPER FUNCTIONS
    function deepScraper() {
        const candidates = document.querySelectorAll('main, [role="main"], .flex-1, body');
        let container = document.body;
        let maxLen = 0;
        candidates.forEach(c => { if (c.innerText.length > maxLen) { maxLen = c.innerText.length; container = c; }});
        return container.innerText;
    }

    function cleanTranscript(text) {
        const junkPhrases = ["New chat", "Ctrl", "Shift", "Upgrade", "Free offer", "Share", "Regenerate", "Copy code", "Read Aloud", "Bad response", "ChatGPT can make mistakes"];
        return text.split('\n').filter(line => {
            let t = line.trim();
            if (t.length === 0) return false;
            if (junkPhrases.some(j => t.includes(j))) return false;
            if (t.match(/^[0-9a-f-]{36}/) || t.match(/^\d{4}-\d{2}-\d{2}T/)) return false;
            return true;
        }).join('\n').replace(/\n{3,}/g, '\n\n');
    }

    // REDACTION ENGINE
    function redactPII(text) {
        return text
            // Redact Emails (e.g., user@example.com)
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]")
            // Redact Credit Cards (16 digits with dashes or spaces)
            .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "[CARD_REDACTED]")
            // Redact Phone Numbers (Simple US/Intl format)
            .replace(/\b\+?\d{1,2}[- ]?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b/g, "[PHONE_REDACTED]");
    }

    function injectText(text) {
        const selectors = ['div[contenteditable="true"]', '#prompt-textarea', 'textarea'];
        let input = null;
        for (let s of selectors) {
            const el = document.querySelector(s);
            if (el && el.offsetParent !== null) { input = el; break; }
        }
        if (!input) return;
        input.focus();
        const success = document.execCommand('insertText', false, text);
        if (!success && input.tagName === 'TEXTAREA') {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            setter.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function tryPressEnter() {
        const input = document.querySelector('textarea, div[contenteditable="true"]');
        if (!input) return;
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
        setTimeout(() => {
            const sendBtn = document.querySelector('button[data-testid="send-button"], button[aria-label="Send message"], .send-button');
            if (sendBtn) sendBtn.click();
        }, 300);
    }
    
    function downloadJSON(content) {
        const data = { timestamp: new Date().toISOString(), source: window.location.hostname, content: content };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-transcript-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
})();