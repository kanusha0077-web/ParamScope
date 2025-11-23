# ParamScope

![alt text](https://github.com/adam-p/markdown-here/raw/master/src/common/images/icon48.png "Logo Title Text 1")

**ParamScope** is a powerful Tampermonkey userscript that acts as a **parameter reconnaissance engine**.  
It automatically discovers **hidden, visible, dynamic, static, and script-defined parameters** present in any webpage — including those buried in JavaScript, JSON, forms, cookies, meta tags, URL queries, and data attributes.

If you do penetration testing, bug bounty research, OSINT, web recon, or simply need to understand how a web application sends data, **ParamScope gives you a full map of every parameter in play**.

---

## 🚀 Features

### 🔍 Comprehensive Parameter Discovery
ParamScope passively extracts parameters from:

- **URL query parameters** (`?id=123&user=abc`)
- **Forms**  
  - Hidden fields  
  - Visible fields  
  - Radio/checkbox values  
  - Multi-selects  
- **HTML data attributes** (`data-user`, `data-id`, `data-token`, etc.)
- **Meta tags** (`<meta name="csrf-token">`)
- **Cookies** (`document.cookie`)
- **JSON blobs inside scripts**
  - `<script type="application/json">`
  - `<script type="application/ld+json">`
- **Inline JavaScript assignments**
  - `var userId = "123";`
  - `config: "value"`
  - `{ token: "xyz" }`

Everything is normalized and stored with:

- Parameter name  
- Example values  
- Occurrence count  
- Where it originated (URL, form, JSON, JS, meta, etc.)

---

## 📊 Real-Time Recon Panel

ParamScope displays a compact, draggable live panel showing:

- Total unique parameter names
- Total parameter occurrences
- Breakdown by source:
  - URL queries  
  - Form fields  
  - Data attributes  
  - JSON keys  
  - Meta tags  
  - Cookies  
  - JavaScript assignments
- Last scan timestamp

The panel can be collapsed, moved, or closed entirely.

You can also toggle the panel instantly with:

