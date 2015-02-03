'use strict';
var express            = require('express')
  , morgan             = require('morgan')
  , oboe               = require('./lib/oboe-requester')
  , API                = require('./lib/api')
  , DocSetTokenCounter = require('./lib/doc-set-token-counter')
  , SendInterval       = 500 // ms between sends
  , app                = express();

app.use(morgan('combined'));

var nextRequestId = 1;

app.get('/generate', function(req, res, next) {
  var api = new API(req.query.server, req.query.apiToken)
    , requestId = nextRequestId++, requestStartDate = new Date()
    , storeStream = api.getStoreState(oboe), docStream;

  res.header('Content-Type', 'application/json');

  //Check the store. If we don't have a saved result, generate + save one.
  storeStream.done(function(json) {
    if(!objIsEmpty(json)) {
      res.end('[' + JSON.stringify(json) + ']');
      console.log(
        '[req %d] sent the JSON for docset %d from the store - %d ms elapsed',
        requestId,
        req.query.documentSetId,
        new Date() - requestStartDate
      );
    }

    else {
      var counter = new DocSetTokenCounter()
        , nDocumentsProcessed = 0, nDocumentsTotal
        , firstSend = true, sendTimeoutId;
      
      docStream = api.getAllDocuments(oboe, req.query.documentSetId, "random");
      docStream
        .node('pagination.total', function(total) {
          nDocumentsTotal = total;

          sendTimeoutId = setTimeout(sendSnapshotAndQueue, SendInterval);
        })
        .node('items.*', function(doc) {
          nDocumentsProcessed += 1;
          counter.processDocument(doc.text);

          return oboe.drop; //remove the doc from memory
        })
        .done(function () {
          var lastJson = getSnapshotJson();
          clearTimeout(sendTimeoutId);
          sendSnapshot(true, lastJson);
          api.setStoreState(oboe, lastJson);
        });
    }

    function getSnapshotJson() {
      var vector = tfdfArrayToTfMap(counter.getTopTokens(150))
        , progress = nDocumentsTotal ? (nDocumentsProcessed / nDocumentsTotal) : 0;

      return JSON.stringify({
        "progress": progress,
        "tokens": vector
      });
    }

    function sendSnapshot(lastSend, json) {
      res.write((firstSend ? "[" : ",") + json);
      firstSend = false;

      if (lastSend) {
        res.end("]");
      }

      console.log(
        '[req %d] pushed %s JSON for docset %d - %d ms elapsed',
        requestId,
        lastSend ? 'last' : 'some',
        req.query.documentSetId,
        new Date() - requestStartDate
      );
    }

    function sendSnapshotAndQueue() {
      sendSnapshot(false, getSnapshotJson());
      sendTimeoutId = setTimeout(sendSnapshotAndQueue, SendInterval);
    }
  });

  function abort() {
    console.log('[req %d] abort', requestId);
    storeStream.abort();
    if(docStream && docStream.abort) {
      docStream.abort(); // docStream will fire no more callbacks
    }
    if (sendTimeoutId) { clearTimeout(sendTimeoutId); }
    res.end();
  }

  req.on('close', abort);
});

app.get('/show', function(req, res, next) {
  //just render the view. it'll make requests from
  //the client to /generate with any selection info.
  res.render('show.jade', req.query);
});

app.get('/metadata', function(req, res, next) {
  res.status(204).header('Access-Control-Allow-Origin', '*').send();
})

app.use('/static', express.static(__dirname + '/public'));
app.listen(process.env.PORT || 3000);
console.log('Listening on port ' + (process.env.PORT || 3000));

//Converts a [['term', tf, df], ...] array to {'term': tf, ...}
function tfdfArrayToTfMap(tfdf) {
  var obj = {};
  tfdf.forEach(function(it) { obj[it[0]] = it[1]; });
  return obj;
}

function objIsEmpty(obj) {
  var hasOwnProperty = Object.prototype.hasOwnProperty;
  for (var key in obj) {
    if (hasOwnProperty.call(obj, key)) return false;
  }
  return true;
}
