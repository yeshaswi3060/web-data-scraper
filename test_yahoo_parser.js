const fs = require('fs');
const cheerio = require('cheerio');
const data = fs.readFileSync('yahoo.html', 'utf-8');
const $ = cheerio.load(data);
const results = [];
$('div.algo-sr').each((i, el) => {
   const a = $(el).find('a[data-matarget="algo"]');
   const title = a.find('h3.title span').text().trim() || a.text().trim();
   let url = a.attr('href');
   if(url && url.includes('RU=')) {
       url = decodeURIComponent(url.split('RU=')[1].split('/RK=')[0]);
   }
   const snippet = $(el).find('.compText p').text().trim();
   if (title && url) results.push({title, url, snippet});
});
console.log(results);
