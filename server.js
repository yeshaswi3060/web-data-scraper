const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

// Real Estate Schema Fields definition
const SCHEMA_FIELDS = [
  "projectName", "city", "locality", "address", "totalTowers", "totalFloors",
  "consultantUserId", "country", "status", "shortName", "subLocality", "zone",
  "landmark", "pincode", "entryStatus", "societyType", "currentStatus",
  "developerType", "builderName", "reraId", "yearOfLaunch", "yearOfPossession",
  "totalUnits", "landArea", "densityCategory", "liftsPerTower", "powerBackupCoverage",
  "waterSource", "wasteManagementSystem", "averageDailyPowerCuts", "entryAccessType",
  "cctvCoverage", "billingPattern", "managedBy", "perceivedAirQuality",
  "surroundingAreaType", "streetLighting", "visitorParkingAvailability", "stpStatus",
  "rainwaterHarvestingStatus", "securityGuardsStatus", "upcomingMajorWorks",
  "recentSpecialCharges", "demolitionSealingStatus", "landLitigationStatus",
  "legalIssuesStatus", "metroDistance", "marketDistance", "hospitalDistance",
  "schoolDistance", "peakTravelTime", "offPeakTravelTime", "positioning",
  "primaryDataSource", "dataConfidenceLevel", "parkingTypes", "internetCableProviders",
  "accessControlFeatures", "badges", "chargePerSqft", "avgMonthlyMaintenance",
  "maintenanceDefaultRate", "internalNotes", "coreAmenities", "lifestyleAmenities",
  "childrenAmenities", "convenienceAmenities", "greenSpaces", "dominantResidentType",
  "ownerTenantRatio", "nriPresenceLevel", "communityActivityLevel", "commonActivities",
  "trafficNoiseAtGate", "internalNoise", "womenSafetyScore", "walkabilityScore",
  "constructionQuality", "internalRoadsQuality", "commonAreaMaintenance",
  "cleanlinessScore", "liftReliability", "staffBehavior", "societyStrictnessLevel"
];

// Initialize local DB state
let db = {
  properties: [], // list of { id, name, status, data: { [field]: value }, sources: [], error }
  agentState: 'idle', // 'idle' | 'running' | 'paused'
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    db = JSON.parse(raw);
    db.agentState = 'idle';
  } catch (e) {
    console.error("Failed to load db, resetting:", e);
  }
}

function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// SSE Logging setup
let clients = [];
function logToClients(message, type = 'info') {
  const logEvent = {
    timestamp: new Date().toLocaleTimeString(),
    message,
    type
  };
  console.log(`[${type.toUpperCase()}] ${message}`);
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify(logEvent)}\n\n`);
  });
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const google = require('googlethis');
const pdfParse = require('pdf-parse');

// Yahoo Search Crawler (Highly Reliable Fallback)
async function searchWeb(query) {
  try {
    logToClients(`Searching web for: "${query}"`, 'search');
    const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);
    const results = [];
    $('div.algo-sr').each((i, el) => {
       if(results.length >= 4) return;
       const a = $(el).find('a[data-matarget="algo"]');
       const title = a.find('h3.title span').text().trim() || a.text().trim();
       let linkUrl = a.attr('href');
       if(linkUrl && linkUrl.includes('RU=')) {
           linkUrl = decodeURIComponent(linkUrl.split('RU=')[1].split('/RK=')[0]);
       }
       const snippet = $(el).find('.compText p').text().trim();
       if (title && linkUrl) {
           results.push({ title, url: linkUrl, snippet });
       }
    });
    return results;
  } catch (error) {
    logToClients(`Search error: ${error.message}`, 'error');
    return [];
  }
}

// Scrape url body text
async function scrapePageContent(url) {
  try {
    logToClients(`Visiting site: ${url}`, 'scrape');
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      },
      timeout: 20000,
      responseType: 'arraybuffer' // Handle both text and binary
    });

    const contentType = response.headers['content-type'] || '';
    
    // Check if it's a PDF
    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      const parser = typeof pdfParse === 'function' ? pdfParse : (pdfParse.PDFParse || pdfParse.default);
      const pdfData = await parser(response.data);
      // Limit PDF text to 6000 chars
      return pdfData.text.replace(/\s+/g, ' ').trim().substring(0, 6000);
    }

    // Otherwise, parse as normal HTML
    const htmlString = response.data.toString('utf-8');
    const $ = cheerio.load(htmlString);
    
    // Extract media links before stripping elements
    let mediaLinks = "\n\n--- MEDIA & FILES FOUND ON PAGE ---\n";
    let imgCount = 0;
    $('img').each((i, el) => {
       if (imgCount >= 15) return;
       const src = $(el).attr('src');
       const alt = $(el).attr('alt') || $(el).attr('title') || 'image';
       if (src && src.startsWith('http')) {
           mediaLinks += `Image [${alt}]: ${src}\n`;
           imgCount++;
       }
    });
    let pdfCount = 0;
    $('a').each((i, el) => {
       if (pdfCount >= 10) return;
       const href = $(el).attr('href');
       const linkText = $(el).text().trim() || 'link';
       if (href && href.startsWith('http') && href.toLowerCase().includes('.pdf')) {
           mediaLinks += `PDF Document [${linkText}]: ${href}\n`;
           pdfCount++;
       }
    });

    // Remove unwanted elements
    $('script, style, nav, header, footer, iframe, noscript, svg').remove();
    
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    // Limit text to 4000 chars, append media links (up to 2000 chars)
    return text.substring(0, 4000) + mediaLinks.substring(0, 2000);
  } catch (error) {
    logToClients(`Scrape failed for ${url}: ${error.message}`, 'error');
    return null;
  }
}

async function extractRealEstateSchemaWithNVIDIA(projectName, gatheredContent, existingData = null) {
  logToClients(`Contacting NVIDIA API to extract property details...`, 'ai');
  
  const token = process.env.NVIDIA_API_KEY || "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";
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";

  let baseInstructions = `You are an expert real estate researcher in India. Your goal is to extract detailed society facts about the residential project "${projectName}" based on the web content snippet provided.
  
Output MUST be valid JSON matching these exact keys and formats:
{
  "projectName": "Puravankara Purva Silver Sky" (or similar),
  "city": "Bangalore",
  "locality": "Electronic City",
  "address": "Full extracted postal address",
  "totalTowers": 3 (integer, or null if unknown),
  "totalFloors": 32 (integer, or null if unknown),
  "consultantUserId": 47 (hardcode to 47),
  "country": "India",
  "status": "Draft" (default to "Draft"),
  "shortName": "Purva Silver Sky",
  "subLocality": "Hebbagodi",
  "zone": "South" (or North/East/West/Central/null),
  "landmark": "extracted nearby landmark",
  "pincode": "extracted 6-digit pin code",
  "entryStatus": "Complete" (default to "Complete"),
  "societyType": "Residential Society",
  "currentStatus": "Published",
  "developerType": "Builder",
  "builderName": "PURAVANKARA LIMITED",
  "reraId": "PRM/KA/RERA/... or null",
  "yearOfLaunch": "e.g. Jan 2026",
  "yearOfPossession": "e.g. Jul 2030",
  "totalUnits": 356 (integer, or null),
  "landArea": "6.99" (string represent acreage, e.g. "6.99", or null),
  "densityCategory": "Very High" (or High/Medium/Low/null),
  "liftsPerTower": "2" (string or null),
  "powerBackupCoverage": "Yes" (or No/Partial/null),
  "waterSource": "Borewell / Groundwater" (or Municipal/Both/null),
  "wasteManagementSystem": "Yes" (or No/null),
  "averageDailyPowerCuts": "none" (or "1 hour", etc.),
  "entryAccessType": "single entry gate" (or multiple/null),
  "cctvCoverage": "full campus" (or partial/null),
  "billingPattern": "Monthly" (or Quarterly/null),
  "managedBy": "Builder / Developer" (or RWA/Association/null),
  "perceivedAirQuality": "Good" (or Moderate/Poor/null),
  "surroundingAreaType": "Residential + small markets" (or similar description),
  "streetLighting": "Adequate" (or Poor/null),
  "visitorParkingAvailability": "Good / Plenty" (or Limited/null),
  "stpStatus": "Yes" (or No/null),
  "rainwaterHarvestingStatus": "Yes" (or No/null),
  "securityGuardsStatus": "Yes" (or No/null),
  "upcomingMajorWorks": "Not sure" (or details),
  "recentSpecialCharges": "Not sure" (or details),
  "demolitionSealingStatus": "Not sure" (or details),
  "landLitigationStatus": "No" (or Yes/null),
  "legalIssuesStatus": "No known issues" (or details),
  "metroDistance": "1-2 km" (or similar),
  "marketDistance": "2-5 km" (or similar),
  "hospitalDistance": "1-2 km" (or similar),
  "schoolDistance": "2-5 km" (or similar),
  "peakTravelTime": "15" (minutes string or null),
  "offPeakTravelTime": "25" (minutes string or null),
  "positioning": "Luxury" (or Premium/Mid-segment/Budget/null),
  "primaryDataSource": "Website",
  "dataConfidenceLevel": "High (personally verified)" (or Medium/Low),
  "parkingTypes": null,
  "internetCableProviders": "[\"JioFiber\", \"ACT / Hathway / Spectra\", \"Airtel Xstream / Airtel broadband\", \"Local cable / broadband\"]" (JSON array string),
  "accessControlFeatures": null,
  "badges": "[\"Near metro\", \"Family friendly\", \"Luxury / premium\"]" (JSON array string or null),
  "chargePerSqft": "4" (string number or null),
  "avgMonthlyMaintenance": "7,450 – 13,800" (string or null),
  "maintenanceDefaultRate": null,
  "internalNotes": "List any unique features like landscape garden, sports facilities, cafeteria, etc.",
  "coreAmenities": "[\"Lifts in towers\", \"Power Backup\", \"Fire safety systems\", \"CCTV in common areas\", \"24x7 Security\", \"Community / multipurpose hall\", \"Intercom\"]" (JSON array string),
  "lifestyleAmenities": "[\"Clubhouse\", \"Indoor games room\", \"Kids pool\", \"Gym / Fitness centre\", \"Swimming pool (adult)\", \"Amphitheatre / open-air stage\", \"Jogging / walking track\", \"Badminton court\", \"Cricket net / ground\", \"Yoga / meditation area\"]" (JSON array string),
  "childrenAmenities": "[\"Kids play area\", \"Creche / daycare inside\", \"Skating rink\"]" (JSON array string),
  "convenienceAmenities": "[\"Shops / daily needs inside campus\", \"Salon / spa\", \"Pharmacy / medical store\"]" (JSON array string),
  "greenSpaces": "[\"Dedicated pet park\", \"Water bodies / fountain areas\"]" (JSON array string),
  "dominantResidentType": "Families" (or Bachelors/Mix/null),
  "ownerTenantRatio": "Mostly Owners" (or Mostly Tenants/50-50/null),
  "nriPresenceLevel": "Medium" (or High/Low/null),
  "communityActivityLevel": "Active" (or Quiet/null),
  "commonActivities": "[\"Festival celebrations\", \"Cultural programs / events\"]" (JSON array string),
  "trafficNoiseAtGate": 3 (integer 1-5, or null),
  "internalNoise": 3 (integer 1-5, or null),
  "womenSafetyScore": 4 (integer 1-5, or null),
  "walkabilityScore": 4 (integer 1-5, or null),
  "constructionQuality": 4 (integer 1-5, or null),
  "internalRoadsQuality": 3 (integer 1-5, or null),
  "commonAreaMaintenance": 3 (integer 1-5, or null),
  "cleanlinessScore": 4 (integer 1-5, or null),
  "liftReliability": 4 (integer 1-5, or null),
  "staffBehavior": 4 (integer 1-5, or null),
  "societyStrictnessLevel": 3 (integer 1-5, or null),
  "files": [
    {
      "fileType": "FRONT_ELEVATION_PHOTO",
      "fileUrl": "Extract the best high-quality URL for the main facade. Ignore tiny logos/icons. Return null if none found.",
      "description": "Front Elevation / Main Facade Photo",
      "sortOrder": 1
    },
    {
      "fileType": "MAIN_GATE_PHOTO",
      "fileUrl": "Extract the best high-quality URL for the entrance. Ignore tiny logos/icons. Return null if none found.",
      "description": "Main Gate / Entrance Photo",
      "sortOrder": 2
    },
    {
      "fileType": "CENTRAL_PARK_PHOTO",
      "fileUrl": "Extract the best high-quality URL for open areas/parks. Ignore tiny logos/icons. Return null if none found.",
      "description": "Central Park / Main Open Area Photo",
      "sortOrder": 3
    },
    {
      "fileType": "CLUBHOUSE_PHOTO",
      "fileUrl": "Extract the best high-quality URL for the clubhouse or lobby. Ignore tiny logos/icons. Return null if none found.",
      "description": "Clubhouse / Lobby / Key Common Area Photo",
      "sortOrder": 4
    },
    {
      "fileType": "RERA_CERTIFICATE_DOC",
      "fileUrl": "Extract the exact PDF URL for the RERA certificate or brochure. Return null if none found.",
      "description": "RERA Certificate / Key Approval Documents",
      "sortOrder": 6
    }
  ]
}`;

  if (existingData) {
    baseInstructions += `\n\n=== EXISTING PARTIAL DATA ===\nHere is the JSON of what we have successfully extracted so far:\n${JSON.stringify(existingData, null, 2)}\n\nINSTRUCTION: MERGE any new facts from the provided Web Content into this existing JSON. Overwrite 'null', '-', or 'Not sure' values if you find new data. Do NOT obsess over adding new images if the text fields are still missing. Priority is filling out missing text fields!`;
  }

  const systemPrompt = `${baseInstructions}

Extract values based on this Web Content text:
"""
${gatheredContent}
"""

CRITICAL INSTRUCTION: Your output MUST be exactly one JSON object. You MUST include ALL keys listed above exactly as they appear. Do NOT omit any keys, even if the data is missing. If data is missing or unknown, set the value to null or "Not sure". Do not use markdown codeblocks like \`\`\`json. Return only the raw JSON string.`;

  try {
    const response = await axios.post(url, {
      model: "moonshotai/kimi-k2.6",
      messages: [{ role: "user", content: systemPrompt }],
      max_tokens: 16384,
      temperature: 0.2, // lower temperature for strict factual JSON extraction
      top_p: 1.0,
      stream: true
    }, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      responseType: 'stream',
      timeout: 120000 // 120 seconds timeout for large schemas
    });

    return new Promise((resolve, reject) => {
      let fullContent = "";
      let buffer = "";
      
      response.data.on('data', chunk => {
        buffer += chunk.toString();
        let lines = buffer.split('\n');
        // The last element is either an empty string (if buffer ended with \n) 
        // or a partial line. Keep it in the buffer.
        buffer = lines.pop(); 
        
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          if (line === 'data: [DONE]') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              const parsed = JSON.parse(jsonStr);
              if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                const textChunk = parsed.choices[0].delta.content;
                fullContent += textChunk;
                // Log progress sparingly to avoid spamming the UI
                if (fullContent.length % 500 === 0 || textChunk.includes('}')) {
                  logToClients(`AI Parsing schema chunk... [length: ${fullContent.length}]`, 'ai');
                }
              }
            } catch(e) {
              // Ignore partial JSON parse errors in SSE stream
            }
          }
        }
      });

      response.data.on('end', () => {
        let rawJson = fullContent.trim();
        
        // Advanced Sanitizer: Strip out markdown formatting and any conversational text
        // Sometimes models output text before or after the JSON block
        const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          rawJson = jsonMatch[0];
        } else {
          // Fallback if no {} found
          rawJson = rawJson.replace(/^```(json)?/, '').replace(/```$/, '').trim();
        }
        
        try {
          const parsed = JSON.parse(rawJson);
          logToClients('Successfully parsed JSON data from NVIDIA model!', 'success');
          resolve(parsed);
        } catch(e) {
          logToClients(`JSON parsing error: ${e.message}`, 'error');
          // Fallback: return what we have so user can manually fix
          reject(new Error(e.message));
        }
      });
      
      response.data.on('error', err => {
        reject(err);
      });
    });

  } catch (err) {
    logToClients(`NVIDIA Extraction failed: ${err.message}`, 'error');
    return null;
  }
}

// Background Worker Loop
let isWorkerRunning = false;
async function startAgentWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  logToClients('Agent worker loop active.', 'system');

  while (db.agentState === 'running') {
    const propIndex = db.properties.findIndex(p => p.status === 'pending' || p.status === 'processing');
    if (propIndex === -1) {
      logToClients('All properties searched. Agent going to standby.', 'system');
      db.agentState = 'idle';
      saveDb();
      break;
    }

    const prop = db.properties[propIndex];
    prop.status = 'processing';
    saveDb();

    try {
      const MAX_ITERATIONS = 3;
      let currentData = prop.data && Object.keys(prop.data).length > 0 ? prop.data : null;
      let allSources = prop.sources || [];

      for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
        if (db.agentState !== 'running') break;
        logToClients(`==== Researching Project: "${prop.name}" (Iteration ${iter}/${MAX_ITERATIONS}) ====`, 'system');

        let queries = [];
        if (iter === 1) {
          // Broad queries for first pass
          queries = [
            `${prop.name} Bangalore brochure address builder details`,
            `${prop.name} RERA ID amenities unit count floors`
          ];
        } else {
          // Calculate missing fields to generate targeted query
          let missingKeys = [];
          if (currentData) {
            for (const [key, value] of Object.entries(currentData)) {
              if (value === null || value === '-' || value === '' || value === 'Not sure') {
                missingKeys.push(key);
              }
            }
          }
          if (missingKeys.length === 0) {
             logToClients(`All fields successfully extracted! Ending loop early.`, 'success');
             break;
          }
          logToClients(`${missingKeys.length} fields missing. Generating targeted query...`, 'system');
          const targetFields = missingKeys.slice(0, 3).join(' ');
          queries = [`${prop.name} Bangalore ${targetFields}`];
        }

        let combinedWebText = "";
        let allTargets = [];
        
        for (const query of queries) {
          if (db.agentState !== 'running') break;
          const links = await searchWeb(query);
          allTargets.push(...links);
          await sleep(1000);
        }

        // Deduplicate and filter already visited URLs across iterations
        let uniqueTargets = [];
        const seenUrls = new Set(allSources);
        for (const target of allTargets) {
          if (!seenUrls.has(target.url)) {
            uniqueTargets.push(target);
            seenUrls.add(target.url);
          }
        }

        // Fallback if target queries yield nothing new
        if (uniqueTargets.length === 0 && iter > 1) {
           logToClients(`No new URLs found for specific fields. Falling back to broad media search...`, 'system');
           const fallbackQuery = `${prop.name} Bangalore brochure images floor plan master plan gallery pdf`;
           const fbLinks = await searchWeb(fallbackQuery);
           for (const target of fbLinks) {
             if (!seenUrls.has(target.url)) {
               uniqueTargets.push(target);
               seenUrls.add(target.url);
             }
           }
        }

        if (uniqueTargets.length === 0) {
           logToClients(`No new web sources found for iteration ${iter}.`, 'system');
           if (iter > 2) break; // Give it at least 2 tries before quitting
        }

        // Limit to top 2 links per query (or 4 total unique links per iteration) to prevent LLM overload
        const targetsToScrape = uniqueTargets.slice(0, 4);

        for (const target of targetsToScrape) {
          if (db.agentState !== 'running') break;
          const text = await scrapePageContent(target.url);
          if (text && text.length > 200) {
            combinedWebText += `\n\n--- Source: ${target.url} ---\n${text}`;
            allSources.push(target.url);
          }
          await sleep(500); // Be polite
        }

        if (db.agentState !== 'running') break;

        // Prevent LLM context overflow (roughly 10,000 words max)
        combinedWebText = combinedWebText.split(' ').slice(0, 10000).join(' ');

        if (!combinedWebText.trim() && iter === 1) {
          throw new Error("Failed to extract any text from web sources on iteration 1.");
        }
        
        if (!combinedWebText.trim() && iter > 1) {
           logToClients(`Skipping LLM extract: no new text found this iteration.`, 'system');
           continue;
        }

        // Run NVIDIA AI Extraction, passing in currentData to merge
        const extractedJson = await extractRealEstateSchemaWithNVIDIA(prop.name, combinedWebText, currentData);
        
        if (extractedJson) {
           currentData = extractedJson;
           if (!currentData.consultantUserId) currentData.consultantUserId = 47;
           
           // Update database with partial/full state so UI updates in real-time mid-loop!
           prop.data = currentData;
           prop.sources = allSources;
           saveDb();
           logToClients(`Completed iteration ${iter}! Data updated.`, 'success');
        } else {
           logToClients(`AI Extraction returned null for iteration ${iter}`, 'error');
        }
        
        await sleep(2000);
      }

      if (db.agentState === 'running') {
        prop.status = 'completed';
        saveDb();
        logToClients(`Finished extraction for "${prop.name}"!`, 'success');
      }
    } catch (err) {
      prop.status = 'failed';
      prop.error = err.message;
      logToClients(`Error researching "${prop.name}": ${err.message}`, 'error');
      saveDb();
    }

    await sleep(4000);
  }

  isWorkerRunning = false;
  logToClients('Agent worker loop stopped.', 'system');
}

// API Routes
app.get('/api/data', (req, res) => {
  res.json({
    properties: db.properties,
    agentState: db.agentState,
    schemaFields: SCHEMA_FIELDS
  });
});

app.post('/api/properties', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Property name is required' });
  }

  // Clear existing items to support clean single testing interface
  db.properties = [];

  const newProp = {
    id: Date.now().toString(),
    name: name.trim(),
    status: 'pending',
    data: {},
    sources: [],
    error: null
  };

  db.properties.push(newProp);
  saveDb();
  logToClients(`Set research target: "${newProp.name}"`, 'system');
  res.json({ success: true, property: newProp });

  if (db.agentState === 'running') {
    startAgentWorker();
  }
});

app.post('/api/properties/update', (req, res) => {
  const { id, field, value } = req.body;
  const prop = db.properties.find(p => p.id === id);
  if (prop) {
    if (!prop.data) prop.data = {};
    prop.data[field] = value;
    saveDb();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Property not found' });
  }
});

app.post('/api/properties/clear', (req, res) => {
  db.properties = [];
  saveDb();
  logToClients('Cleared research dashboard.', 'system');
  res.json({ success: true });
});

app.post('/api/agent/control', (req, res) => {
  const { state } = req.body;
  if (['running', 'paused', 'idle'].includes(state)) {
    db.agentState = state;
    saveDb();
    logToClients(`Agent state changed: ${state}`, 'system');
    res.json({ success: true, agentState: db.agentState });

    if (db.agentState === 'running') {
      startAgentWorker();
    }
  } else {
    res.status(400).json({ error: 'Invalid state' });
  }
});

app.post('/api/apikey', (req, res) => {
  const { apiKey } = req.body;
  if (typeof apiKey === 'string') {
    process.env.NVIDIA_API_KEY = apiKey;
    try {
      const envPath = path.join(__dirname, '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }
      if (envContent.includes('NVIDIA_API_KEY=')) {
        envContent = envContent.replace(/NVIDIA_API_KEY=.*/, `NVIDIA_API_KEY=${apiKey}`);
      } else {
        envContent += `\nNVIDIA_API_KEY=${apiKey}`;
      }
      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
      logToClients('NVIDIA API token stored in .env', 'system');
    } catch (err) {
      logToClients(`Failed storing key to .env: ${err.message}`, 'warning');
    }
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'apiKey must be a string' });
  }
});

app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);
  logToClients('Dashboard connection established.', 'system');

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
