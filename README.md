rhosync.js
===

A javascript client library for the [RhoSync](http://rhomobile.com/products/rhosync) App Integration Server.

Using `rhosync.js`, your web application's model data will transparently synchronize with a mobile application built using the [Rhodes framework](http://rhomobile.com/products/rhodes), or any of the available [RhoSync clients](http://rhomobile.com/products/rhosync/).  This client not includes *yet* any built-in persistence support for models. But are working on it.

## Getting started

Load the rhosync.js library:

    <html>
    <head>
        <title>RhoSync.js load sample</title>

        <script type="text/javascript" language="javascript" src="../javascript/jquery-1.5.1.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/json.js"></script>

        <script type="text/javascript">
            RhoConfig = {
                syncServer: "http://localhost:9292/application"
            };
        </script>

        <script type="text/javascript" language="javascript" src="../javascript/rhosync/rhosync.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhosync/rhosync.common.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhosync/rhosync.protocol.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhosync/rhosync.domain.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhosync/rhosync.storage.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhosync/rhosync.engine.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhosync/notify.engine.js"></script>
    </head>
    <body>
    </body>
    </html>

Note, `rhosync.js` depends on [jQuery 1.5](http://jquery.com/) and JSON plugin. Because rhosync.js is built around html5 asynchronous interfaces it actively using [deferred objects](http://api.jquery.com/category/deferred-object/). Most of API methods return deferred object instead of immediate value of result.

## Deployment on RhoSync instance
To deploy your rhosync.js web application on existing [RhoSync server](http://rhomobile.com/products/rhosync/) you need to perform followed actions:

1. Edit config.ru and add this code to "Rhosync server flags" section:

    `Rhosync::Server.set :public, File.dirname(__FILE__) + '/public'`

2. Create directory "public" in the root directory of [RhoSync server](http://rhomobile.com/products/rhosync/) instance.
3. Put your rhosync.js web application to created directory.
4. Restart [RhoSync server](http://rhomobile.com/products/rhosync/) if needed.
5. Access you application on *http://rhosync_server_address:port/path_relative_to_public_dir/your_index.html*

## Usage
Use RhoSync global object with it methods as the API:

    // all API methods return deferred object to watch on
    RhoSync.login("lars", "larspass").done(successCallback).fail(errorCallback);
    RhoSync.syncAllSources("lars", "larspass").done(successCallback).fail(errorCallback);

## Meta
Created and maintained by Dmitry Prokhorov.

Released under the [MIT License](http://www.opensource.org/licenses/mit-license.php).