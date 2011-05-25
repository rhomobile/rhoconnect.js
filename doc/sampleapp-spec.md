Sample Application Specification
==

## Purpose

To demonstrate Rhoconnect protocol support and javascript API using.

## General Requirements

Sample application needs to be implemented using jQuery and jQuery Mobule. No any specific persistence API needs to
be used at the moment. All javascript libraries and html files should be load from the same server as Rhoconnect runs on.

## User interface

All pages should have "Sync" button on the toolbar. Once user clicks on it the synchronization happens.

### Main page

It consists of:

* Username field
* Password field
* Login button

User enters name/pass, then press login. On login error error splash shown and fields clear happens. On success it transits to the "Sources" page.

### "Sources" page

It shows list of sources. Once user clicks on the source name it transits to the "Objects" page.
Once it appears it refresh sources list.

### "Objects" page

It shows list of objects of the selected source. Once user clicks on the object name it transits to the "Attributes" page.
Once it appears it refresh objects list.

### "Attributes" page

It consists of:

* Add Atribute button
* List of attributes and their values

Once it appears it refresh attributes/values list.

Once user clicks on the attribute value in the list it transits to the "Edit attribute" page.
Once user clicks on Add attribute value it transits to the "Edit Attribute" page showing empty values for name and value.

### "Edit Attribute" page

It consists of:

* Delete Atribute button
* Attribute name field
* Attribute value field
* Save button

Attribute name is editable for new attribute only. For existing attribute it is read-only.
Once user click on Delete button it deletes the attribute and transits to the "Attributes" page
Once user click on Save button it save attribute (name and) value then it transits to the "Attributes" page

## Application initialization code

This code should be used to initialize API:

    <script type="text/javascript" language="javascript" src="../javascript/jquery-1.5.1.js"></script>
    <script type="text/javascript" language="javascript" src="../javascript/json.js"></script>

    <script type="text/javascript">
        var syncUrl = "http://localhost:9292/application";
        RhoConfig = {
            syncServer: syncUrl,
            logLevel: 'trace'
        };
    </script>

    <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.js"></script>
    <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.common.js"></script>
    <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.protocol.js"></script>
    <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.domain.js"></script>
    <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.storage.js"></script>
    <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.engine.js"></script>
    <script type="text/javascript" language="javascript" src="../javascript/rhoconnect/rhoconnect.notify.js"></script>

## API using sample

To login/logout:

    rhoconnect.login(userlogin, userpass, new rhoconnect.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);
    rhoconnect.logout().done(okHdlr).fail(errHdlr);

To change attributes or insert new ones on client side:

    var q ="INSERT INTO changed_values (source_id,object,attrib,value,update_type,sent) VALUES (1,5266,'zip2','value12345','create',5)";
    rhoconnect.rho.storage.executeSql(q).done(okHdlr).fail(errHdlr);

To fire the synchronization:

    rhoconnect.syncAllSources().done(okHdlr).fail(errHdlr)

Where *errHdlr* and *okHdlr* are handler functions like:

    function errHdlr(errCode, errMessage) {
        // some handling goes here
    }

    function okHdlr() {
        // some handling goes here
    }
