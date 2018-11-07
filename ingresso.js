const fs = require('fs');
const puppeteer = require('puppeteer');
const request = require('request-promise');
const csv = require('csvtojson');
const readline = require('readline');
const { google } = require('googleapis');
const CronJob = require('cron').CronJob;
const dalang = require('./wayang-custom');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';

const defaultViewport = {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: 1024,
    isLandscape: false,
    isMobile: false,
    width: 1280
};

const clickAndWait = async (page, selector, duration = 500) => {
    await page.click(selector)
    if (duration === 0) {
        await page.waitForNavigation();
    } else {
        await page.waitFor(duration)
    }
};

const sleepBot = async (page, duration = 500) => {
    await page.evaluate(async (duration) => {
        await new Promise(function (resolve) {
            setTimeout(resolve, duration);
        });
    }, duration);
};

const waitForRecaptcha = async (page, pageClient, kimantep) => {

    kimantep.connectServer();
    kimantep.listenToDalang(async (action) => {
        if (action == 'start') {
            console.log('INICIANDO WEBSOCKET');
        }
        if(action == 'close') {
            console.log('Finalizando WEBSOCKET');
        }
    });

    await pageClient.goto('http://localhost:3388');
    await page.waitForSelector('#g-recaptcha-response');
    await page.focus('#g-recaptcha-response');

    await page.evaluate(async () => {
        //document.querySelector('#g-recaptcha-response').style.display = 'block';
        let elemento = document.querySelector('#g-recaptcha-response');
        let resp;

        while (true) {
            await new Promise(function (resolve) {
                setTimeout(resolve, 10000);
            });
            resp = elemento.value;
            if (resp && resp != '') {
                break;
            }
        }
    });
};

const screenshot = 'eventim_results.png';

const file = fs.readFileSync('ingresso.config');
const line = file.toString('utf8').split('\n');

const sheetId = line[0].split(/=(.+)/)[1];
const timeExecute = line[1].split(/=(.+)/)[1];
let browser;
let isRunning = false;

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);

    const job = new CronJob(
        {
            cronTime: timeExecute,
            onTick: function () {

                if (!isRunning) {
                    isRunning = true;

                    setTimeout(function () {
                        // Authorize a client with credentials, then call the Google Sheets API.
                        authorize(JSON.parse(content), listMajors);
                        isRunning = false;
                    }, 3000);
                }

            }
        })
    job.start();


});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}


/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
function listMajors(auth) {
    const sheets = google.sheets({ version: 'v4', auth });

    sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'parametros',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        const rows = res.data.values;
        let index = 2;
        if (rows.length) {
            rows.shift();

            try {
                (async () => {
                    for (const row of rows) {
                        console.log('Processando linha ' + (index - 1))
                        const params = {
                            portal: row[0],
                            cpf: row[1],
                            usuario: row[2],
                            senha: row[3],
                            retirada_local: row[4],
                            nome: row[5],
                            identidade: row[6],
                            ddd: row[7],
                            telefone: row[8],
                            cep: row[9],
                            endereco_numero: row[10],
                            endereco_complemento: row[11],
                            evento: row[12],
                            setor: row[13],
                            categoria: row[14],
                            quantidade: row[15],
                            cartao_numero: row[16],
                            cartao_nome: row[17],
                            cartao_data_vencimento: row[18],
                            cartao_cvc: row[20],
                            cartao_bandeira: row[21]
                        };

                        try {

                            browser = await puppeteer.launch({
                                headless: false, // launch headful mode
                                slowMo: 0, // slow down puppeteer script so that it's easier to follow visually
                                devtools: false,
                                ignoreHTTPSErrors: true,
                                args: [
                                    '--no-sandbox',
                                    '--disable-setuid-sandbox',
                                    '--proxy-server="direct://"',
                                    '--proxy-bypass-list=*',
                                    '--disable-web-security',
                                    '--lang=pt-BR,pt'
                                ]
                            });

                            try {
                                const page = await browser.newPage();
                                await page.setViewport(defaultViewport);
                                await page.goto(params.portal, {
                                    timeout: 0
                                });

                                await page.type('#cpf', params.cpf)

                                let kimantep = new dalang({
                                    page:page
                                });
                                const pageClient = await browser.newPage();
                                await waitForRecaptcha(page, pageClient, kimantep);
                                
                                if (!pageClient.isClosed()) {
                                    await pageClient.close();
                                }
                                kimantep.disconnectServer();

                                await page.evaluate(async (params) => {

                                    document.querySelector('#main > div > section > div > form > div.row > div.form-group.col-xs-12.col-sm-4.m-b-05 > button').click();

                                }, params)

                                await page.waitFor(3000);

                                await page.type('#email', params.usuario)
                                await page.type('#password', params.usuario)

                                await page.evaluate(async () => {

                                    document.querySelector('#main > div > section > div > form > div.form-group.container-fluid.m-b-1.text-xs-right > div > div.btn2.col-xs-12.col-sm-6.p-x-0 > button').click()

                                })

                                await page.waitFor(3000);

                                await page.evaluate(async (params) => {

                                    document.querySelector('#tab-main-content0 > div').querySelectorAll('div.form-group.row')

                                        .forEach(async item => {

                                            if (item.querySelector('label>span'.textContent.trim() == params.categoria)) {

                                                item.querySelector('select').value = params.quantidade;

                                            }

                                        })

                                    if (params.retirada_local) {
                                        document.querySelector('#radioShippingTypeWillCall').checked = 1;
                                        document.querySelector('#radioShippingTypeDelivery').checked = 0;
                                    }

                                    if (!params.retirada_local) {
                                        document.querySelector('#radioShippingTypeWillCall').checked = 1;
                                        document.querySelector('#radioShippingTypeDelivery').checked = 0;

                                    }

                                }, params)

                                await page.waitFor(2000);

                                await page.type('#nameDelivery', params.nome)
                                await page.type('#id', params.identidade)
                                await page.type('#ddd', params.ddd)
                                await page.type('#tel', params.telefone)
                                await page.type('#cep', params.cep)

                                await page.waitFor(3000)

                                await page.evaluate(async (params) => {

                                    document.querySelector('#main > section > form > fieldset.col-xs-12.rir-cont.rir-delivery-data.p-t-3 > section > div > div:nth-child(2) > div:nth-child(5) > div.col-xs-3.m-b-1 > a').click()

                                }, params)

                                await page.waitFor(3000)

                                await page.type('#number', params.endereco_numero)
                                await page.type('#complement', params.endereco_complemento)

                                await page.type('#card-brand', params.cartao_bandeira)
                                await page.type('#card-number', params.cartao_numero)
                                await page.type('#card-name', params.cartao_nome)

                                await page.type('#card-cpf', params.cpf)
                                await page.type('#card-valid', params.cartao_data_vencimento)
                                await page.type('#card-name', params.cartao_nome)
                                await page.type('#cvv', params.cartao_cvc)


                                await page.evaluate(async () => {

                                    document.querySelector('#main > section > form > div.col-xs-12.m-b-3.rir-cont.rir-terms > div > div:nth-child(2) > div > label > input').checked = 1

                                })


                                await page.waitFor(3000)

                                await page.evaluate(async () => {


                                    document.querySelector('#main > section > form > div.col-xs-12.rir-cont.rir-buttons > div > a').click()

                                })

                                await clickAndWait(page, '#LoginPage_Login_Button', 0)

                                await page.type('#QuickSearch_SearchText_Input', params.evento)
                                await clickAndWait(page, '#QuickSearch_SearchButton_Button', 0)
                                await clickAndWait(page, 'span.btn.btn-tickets', 3000)
                                await clickAndWait(page, 'td.ticketBtn a', 3000)


                                await page.evaluate(async (params) => {

                                    document.querySelectorAll('table#tableAssortmentList_yTix tbody>tr:not(.disabled)')
                                        .forEach(async item => {

                                            if (item.querySelector('td.single-rowspan.priceCategory').textContent.trim() == params.setor &&
                                                item.querySelector('td.single-rowspan.discountLevel').textContent.trim() == params.categoria) {

                                                let cboQuantidade = item.querySelector('select');

                                                if (item.querySelector('td.single-rowspan.priceCategory').textContent.trim().indexOf('MESA') > -1) {
                                                    cboQuantidade.value = 4;
                                                } else {

                                                    let arr = item.querySelectorAll('select option');
                                                    let quantidade_maxima = arr[arr.length - 1].textContent;

                                                    if (params.quantidade > quantidade_maxima) {
                                                        cboQuantidade.value = quantidade_maxima;
                                                    } else {
                                                        cboQuantidade.value = params.quantidade;
                                                    }

                                                }
                                            }

                                        });

                                }, params);

                                index++;

                            } catch (err) {
                                console.error(err)
                                index++;
                                //await browser.close()
                            }

                        } catch (err) {
                            console.error(err)
                        }
                    }
                })();
            } catch (err) {
                console.error(err)
            }
        } else {
            console.log('No data found.');
        }
    });
}