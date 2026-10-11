const session = '33a5ca9a-06de-42cb-983c-15c62b65a159';
const url = `https://wa.rankmation.com/api/sessions/${session}/contacts/184816821653758@lid`;
const headers = {
    'X-API-Key': '**##Abl24288##**',
    'Accept': 'application/json'
};

fetch(url, { method: 'GET', headers })
    .then(res => res.json().then(data => ({status: res.status, data})))
    .then(result => console.log('RESPONSE1:', JSON.stringify(result, null, 2)))
    .catch(err => console.error('ERROR1:', err));

const url2 = `https://wa.rankmation.com/api/contacts?session=${session}`;
fetch(url2, { method: 'GET', headers })
    .then(res => res.json().then(data => ({status: res.status, data})))
    .then(result => console.log('RESPONSE2:', JSON.stringify(result, null, 2).substring(0, 500)))
    .catch(err => console.error('ERROR2:', err));
