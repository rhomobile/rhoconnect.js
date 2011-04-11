(function($, Ext) {

    var LOG = new RhoSync.Logger('application.js');

    Ext.setup({
        // setup options goes here if needed
    });

    var theApp = new Ext.Application({
        launch: doAppLaunch
    });

    function doAppLaunch() {
        var msg = Ext.Msg.alert('Application starting', 'Wait please..', Ext.emptyFn);
        //var msg = showPopup('Application starting', 'Wait please..');
        initRhosync().done(function(){
            msg.hide();
            initUI();
        }).fail(function(error){
            Ext.Msg.alert('Error', error, Ext.emptyFn);
        });
    }

    var sources = {items:[]};

    var models = [
        {
            name: 'Product',
            fields: [
                {name: 'id',        type: 'int'},
                {name: 'brand',     type: 'string'},
                {name: 'name',      type: 'string'},
                {name: 'sku',       type: 'string'},
                {name: 'price',     type: 'string'},
                {name: 'quantity',  type: 'string'}
            ],
            belongsTo: 'Sources'
        },
        {
            name: 'Customer',
            fields: [
                {name: 'id',      type: 'int'},
                {name: 'first',   type: 'string'},
                {name: 'last',    type: 'string'},
                {name: 'phone',   type: 'string'},
                {name: 'email',   type: 'string'},
                {name: 'address', type: 'string'},
                {name: 'city',    type: 'string'},
                {name: 'state',   type: 'string'},
                {name: 'zip',     type: 'string'},
                {name: 'lat',     type: 'string'},
                {name: 'long',    type: 'string'}
            ],
            belongsTo: 'Sources'
        }
    ];

    var displayTemplates = {
        'Product': '{brand} {name}',
        'Customer': '{first} {last}'
    };

    var editForms = {
        'Product': [
            //{xtype: 'hiddenfield', name: 'object_id'}, // we cannot name field as 'id'
            {xtype: 'textfield', name: 'name', label: 'Name', required: true},
            {xtype: 'textfield', name: 'brand', label: 'Brand', required: true},
            {xtype: 'textfield', name: 'sku', label: 'SKU'},
            {xtype: 'textfield', name: 'price', label: 'Price'},
            {xtype: 'textfield', name: 'quantity', label: 'Quantity'}
        ],
        'Customer': [
            //{xtype: 'hiddenfield', name: 'object_id'}, // we cannot name field as 'id'
            {xtype: 'textfield', name: 'first', label: 'First name', required: true},
            {xtype: 'textfield', name: 'last', label: 'Last name', required: true},
            {xtype: 'textfield', name: 'phone', label: 'Phone'},
            {xtype: 'textfield', name: 'email', label: 'Email'},
            {xtype: 'textfield', name: 'address', label: 'Address'},
            {xtype: 'textfield', name: 'city', label: 'City'},
            {xtype: 'textfield', name: 'state', label: 'State'},
            {xtype: 'textfield', name: 'zip', label: 'ZIP'},
            {xtype: 'textfield', name: 'lat', label: 'Latitude'},
            {xtype: 'textfield', name: 'long', label: 'Longitude'}
        ]
    };

    var allPages = [];
    var sourceSelectionPageName = 'SourceSelectionList';
    var currentPageName = null;
    var backTargetName = null;

    function initRhosync() {

        function buildSourcesList() {
            Ext.regModel('SourceSelectionItem', {
                fields: [{name: 'name', type: 'string'}]
            });
            var srcStore = new Ext.data.Store({
                autoLoad: true,
                model: 'SourceSelectionItem',
                data : sources,
                proxy: {
                    type: 'memory',
                    reader: {
                        type: 'json',
                        root: 'items'
                    }
                }
            });
            var list = new Ext.List({
                id: 'SourceSelectionList'/*sourceSelectionPageName*/,
                fullscreen: false,
                itemTpl: '{name}',
                store: srcStore//,
            });
            list.on('itemtap', function(list, index, item, evt){
                var record = list.getRecord(item);
                currentPageName = record.data.name;
                updateSourcePagesState();
            });
            return list;
        }

        function buildStoreFor(model) {
            return new Ext.data.Store({
                id: model.name+'Store',
                autoLoad: true,
                model: model.name,
                proxy: {
                    type: 'rhosync',
                    dbName: 'rhoSyncDb',
                    root: 'items',
                    reader: {
                        type: 'json',
                        root: 'items'
                    }
                }
            });
        }

        function buildListFor(model, store, itemTpl) {
            var list = new Ext.List({
                id: model.name+'List',
                fullscreen: false,
                store: store,
                itemTpl: itemTpl
            });
            list.on('itemtap', function(list, index, item, evt){
                var record = list.getRecord(item);
                currentPageName = record.store.model.modelName+'Form';
                showForm(record);
                //updateSourcePagesState();
            });
            return list;
        }

        function buildFormFor(model, list) {
            //var modelName = record.store.model.modelName;

            var submitItem = {xtype: 'button', text: 'Save', handler: function(btn) {
                var form = Ext.getCmp(model.name+'Form');
                var record = form.getRecord();
                form.updateRecord(record, true);
                record.store.sync();
            }};

            var form = new Ext.form.FormPanel({
                id: model.name+'Form',
                scroll: 'vertical',
                items: editForms[model.name].concat(submitItem)
            });

            return form;
        }

        var srcPages = [];
        $.each(models, function(idx, model){
            Ext.regModel(model.name, model);
            var store = buildStoreFor(model);
            var list = buildListFor(model, store, displayTemplates[model.name]);
            var form = buildFormFor(model, list);
            srcPages.push(list);
            srcPages.push(form);
            sources.items.push({name: model.name});
        });

        var srcList = buildSourcesList();
        allPages = [srcList].concat(srcPages);

        return RhoSync.init(models/*, 'native'*/);
    }

    function showForm(record) {
        var modelName = record.store.model.modelName;
        var form = Ext.getCmp(modelName+'Form');
        form.loadRecord(record);
        Ext.getCmp("sourcesPanel").getLayout().setActiveItem(form.id);
    }

    function showPopup(title, msg) {
        var popup = null;
        if (!popup) {
            popup = new Ext.Panel({
                floating: true,
                modal: true,
                centered: true,
                width: 300,
                height: 200,
                styleHtmlContent: true,
                scroll: 'vertical',
                html: '<p>message_placeholder</p>',
                dockedItems: [
                    {
                        dock: 'top',
                        xtype: 'toolbar',
                        title: 'Overlay Title'
                    }
                ]
            });
        }
        popup.show('pop');
        popup.dockedItems.get(0).setTitle(title);
        popup.body.update('<p class="popup-text">' + msg +'</p>');
        return popup;
    }

    function showError(title, errCode, err) {
        Ext.Msg.alert(title, err || errCode, Ext.emptyFn);
        LOG.error(title +': ' +errCode +': ' +err);
    }

    function doLogin(username, password){
        RhoSync.login(username, password, new RhoSync.SyncNotification()).done(function(){
            Ext.getCmp('mainPanel').setActiveItem('sourcesPanel');
            updateLoggedInState();
        }).fail(function(errCode, err){
            showError('Login error', errCode, err);
        });
    }

    function doLogout(){
        RhoSync.logout().done(function(){
            Ext.getCmp('loginForm').reset();
            updateLoggedInState();
        }).fail(function(errCode, err){
            showError('Logout error', errCode, err);
        });
    }

    function updateLoggedInState() {
        if (RhoSync.isLoggedIn()) {
            Ext.getCmp('mainPanel').setActiveItem('sourcesPanel');
            Ext.getCmp('logoutButton').show();
            Ext.getCmp('syncButton').enable();
        } else {
            Ext.getCmp('mainPanel').setActiveItem('loginForm');
            Ext.getCmp('logoutButton').hide();
            Ext.getCmp('syncButton').disable();
            setTitle('Sign in');
        }
        Ext.getCmp('mainPanel').doLayout();
        updateSourcePagesState();
    }

    function updateSourcePagesState() {
        var pageId = allPages[0].getId();
        if (currentPageName) {
            setTitle(currentPageName);
            pageId = currentPageName+'List';
            backTargetName = sourceSelectionPageName;
        } else {
            setTitle('Sources');
            backTargetName = null;
        }
        updateBackButton();
        Ext.getCmp("sourcesPanel").doLayout();
        Ext.getCmp("sourcesPanel").getLayout().setActiveItem(pageId);
    }

    function updateBackButton() {
        if (backTargetName) {
            Ext.getCmp("backButton").show();
        } else {
            Ext.getCmp("backButton").hide();
        }
    }

    var activeList = null;
    function doSync(){
        var msg = Ext.Msg.alert('Synchronizing now', 'Wait please..', Ext.emptyFn);
        RhoSync.syncAllSources().done(function(){
            //if (activeList) activeList.store.sync();
            msg.hide();
        }).fail(function(errCode, err){
            showError('Synchronization error', errCode, err);
        });
    }

    function setTitle(title) {
        Ext.getCmp('mainToolbar').setTitle(title);
    }

    function buildLoginForm(id) {
        return new Ext.form.FormPanel({
            id: id,
            standardSubmit: false,
            items: [
                {
                    xtype: 'textfield',
                    name : 'login',
                    label: 'Username',
                    value: 'testUserToFailAuth'
                },
                {
                    xtype: 'passwordfield',
                    name : 'password',
                    label: 'Password'
                },
                {
                    xtype: 'button',
                    text: 'Login',
                    ui: 'confirm',
                    handler: function() {
                        var loginForm = Ext.getCmp('loginForm');
                        LOG.trace('username: ' +loginForm.getValues().login);
                        LOG.trace('password: ' +loginForm.getValues().password);
                        doLogin(loginForm.getValues().login, loginForm.getValues().password);
                    }
                }
            ]
        });
    }

    function initUI() {
        var isLoggedIn = RhoSync.isLoggedIn();

        var logoutButton = new Ext.Button({
            id: 'logoutButton',
            text: 'Logout',
            hidden: !isLoggedIn,
            handler: doLogout
        });

        var  backButton = new Ext.Button({
            id: 'backButton',
            text: 'Back',
            ui: 'back',
            handler: function() {
                currentPageName = backTargetName == sourceSelectionPageName ? null : backTargetName;
                updateSourcePagesState();
            }
        });

        var syncButton = new Ext.Button({
            id: 'syncButton',
            text: 'Sync',
            hidden: !isLoggedIn,
            handler: doSync
        });

        var loginForm = buildLoginForm('loginForm');

        var sourcesPanel = new Ext.Panel({
            id: 'sourcesPanel',
            fullscreen: false,
            layout: 'card',
            items: allPages
        });

//        var formsPanel = new Ext.Panel({
//            id: 'formsPanel',
//            fullscreen: false,
//            layout: 'card',
//            items: allPages
//        });

        var mainPanel = new Ext.Panel({
            id: 'mainPanel',
            fullscreen: true,
            layout: 'card',
            dockedItems: [
                {
                    id: 'mainToolbar',
                    xtype: 'toolbar',
                    dock : 'top',
                    title: 'Product',
                    items: [
                        backButton,
                        {xtype: 'spacer'},
                        {xtype: 'spacer'},
                        logoutButton,
                        syncButton
                    ]
                }
            ],
            items: [loginForm, sourcesPanel]
        });

        currentPageName = null;
        updateSourcePagesState();
        updateLoggedInState();
    }

})(jQuery, Ext);
