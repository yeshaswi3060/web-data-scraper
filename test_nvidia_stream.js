const axios = require('axios');
const token = "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";
const url = "https://integrate.api.nvidia.com/v1/chat/completions";

async function test() {
  try {
    const response = await axios.post(url, {
      model: "moonshotai/kimi-k2.6",
      messages: [{ role: "user", content: "Hello, reply with JSON { \"test\": true }" }],
      max_tokens: 4000,
      temperature: 0.2,
      top_p: 1.0,
      stream: true
    }, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      responseType: 'stream'
    });

    response.data.on('data', chunk => {
      console.log("CHUNK:", chunk.toString());
    });
    
    response.data.on('end', () => {
      console.log("END OF STREAM");
    });
  } catch(e) {
    console.log("ERROR:", e.message);
    if(e.response && e.response.data) {
       e.response.data.on('data', chunk => console.log(chunk.toString()));
    }
  }
}
test();
