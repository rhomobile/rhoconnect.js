rhoconnect.js
===

A javascript client library for the [RhoSync](http://rhomobile.com/products/rhosync) App Integration Server.

Using `rhoconnect.js`, your web application's model data will transparently synchronize with a mobile application built using the [Rhodes framework](http://rhomobile.com/products/rhodes), or any of the available [RhoSync clients](http://rhomobile.com/products/rhosync/).  This client not includes *yet* any built-in persistence support for models. But are working on it.

## Getting started

Load the rhoconnect.js library:

    <html>
    <head>
        <title>RhoConnect.js load sample</title>

        <script type="text/javascript" language="javascript" src="../javascript/jquery-1.5.1.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/json.js"></script>

        <script type="text/javascript">
            RhoConfig = {
                syncServer: "http://localhost:9292/application"
            };
        </script>

        <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.common.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.protocol.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.domain.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.storage.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.engine.js"></script>
        <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.notify.js"></script>
    </head>
    <body>
    </body>
    </html>

Note, `rhoconnect.js` depends on [jQuery 1.5](http://jquery.com/) and JSON plugin. Because rhoconnect.js is built around html5 asynchronous interfaces it actively using [deferred objects](http://api.jquery.com/category/deferred-object/). Most of API methods return deferred object instead of immediate value of result.

## Deployment on RhoSync instance
To deploy your rhoconnect.js web application on existing [RhoSync server](http://rhomobile.com/products/rhosync/) you need to perform followed actions:

1. Edit config.ru and add this code to "Rhosync server flags" section:

    `Rhosync::Server.set :public, File.dirname(__FILE__) + '/public'`

2. Create directory "public" in the root directory of [RhoSync server](http://rhomobile.com/products/rhosync/) instance.
3. Put your rhoconnect.js web application to created directory.
4. Restart [RhoSync server](http://rhomobile.com/products/rhosync/) if needed.
5. Access you application on *http://rhosync_server_address:port/path_relative_to_public_dir/your_index.html*

## Usage
Use RhoConnect global object with it methods as the API:

    // all API methods return deferred object to watch on
    RhoConnect.login("username", "password").done(successCallback).fail(errorCallback);
    RhoConnect.syncAllSources().done(successCallback).fail(errorCallback);

## Meta
Created and maintained by Dmitry Prokhorov.

Released under the [MIT License](http://www.opensource.org/licenses/mit-license.php).