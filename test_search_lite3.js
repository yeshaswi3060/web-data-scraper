const axios = require('axios');

async function searchWeb(query) {
  try {
    const searchUrl = `https://lite.duckduckgo.com/lite/`;
    const response = await axios.post(searchUrl, `q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log(response.data.substring(0, 3000));
  } catch (error) {
    console.error(error.message);
  }
}
searchWeb("Puravankara");
