#!/usr/bin/env node

const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const zlib = require('zlib');
const opn = require('opn');
const path = require('path');


const app = express()


const args = process.argv;

let port = 3000

for (var i = 0; i < args.length; i++) {
    let arg = args[i]
    if (arg == "-p" && (i + 1 < args.length)) {
        port = args[i + 1]
    }
}

app.locals.data = null;

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, 'public')))


app.post('/', function (req, res) {
    app.locals.data = req.body;
    const tenant_url = new URL(app.locals.data.tenant_url);
    app.locals.data.tenant_url = tenant_url.hostname;

    res.redirect("/")
});

app.get('/', function (req, res) {
    if(app.locals.data==null){
        res.redirect("form.html")
    }
    let local = app.locals.data;
    if (local.tenant_url === null
        || local.username === null
        || local.password === null) {
        res.redirect("form.html")
    } else {

        let data = local.username + ':' + local.password;
        let buff = new Buffer.from(data);
        let base64data = buff.toString('base64');

        axios({
            method: 'get',
            //pxxxx-tmn.hci.eu1.hana.ondemand.com

            url: "https://" + local.tenant_url + "/itspaces/odata/api/v1/LogFiles?" + "$format=json&$filter=NodeScope%20eq%20%27worker%27"
            , headers: { 'Authorization': 'Basic ' + base64data }
        })
            .then(function (response) {

                response.data.d.results = response.data.d.results
                    .sort((a, b) => (a.LastModified < b.LastModified) - (a.LastModified > b.LastModified))
                    .filter(a => a.LogFileType == local.log_type);

                let logFirst = response.data.d.results[0];

                return axios({
                    method: 'get',
                    responseType: 'arraybuffer',
                    url: "https://" + local.tenant_url + "/itspaces/odata/api/v1/LogFiles" + "(Name='" + logFirst.Name + "',Application='" + logFirst.Application + "')/$value"
                    , headers: { 'Authorization': 'Basic ' + base64data }
                })

            }).then(function (response) {
                zlib.gunzip(Buffer.from(response.data), function (error, result) {
                    if (error) {
                        console.log("zip error" + error)
                        throw error;
                    }

                    let result2 = result.toString('utf8').split("\n").reverse().slice(0, local.last_n_messages).join("\n\n");
                    res.setHeader("Content-Type", "text/plain")
                    res.send(result2)
                })

            })
            .catch(function (error) {
                res.send(JSON.stringify({ success: false, data: error.data }))
            })
            .then(function () {
            });

    }
})

app.listen(port, () => console.log(`SuperEasyLogViewer for CPI on port ${port}!`))
opn('http://localhost:'+port);