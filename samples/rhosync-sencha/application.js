(function($, Ext) {

    var LOG = new RhoSync.Logger('application.js');

    Ext.setup({
        // setup options goes here if needed
    });

    new Ext.Application({
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

    var modelDefinitions = [
        {
            name: 'Product',
            fields: [
                {name: 'id',        type: 'int'},
                {name: 'brand',     type: 'string'},
                {name: 'name',      type: 'string'},
                {name: 'sku',       type: 'string'},
                {name: 'price',     type: 'string'},
                {name: 'quantity',  type: 'string'}
            ]
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
            ]
        }
    ];

    var displayTemplates = {
        'Product': '{brand} {name}',
        'Customer': '{first} {last}'
    };

    var editForms = {
        'Product': [
            {xtype: 'textfield', name: 'name', label: 'Name', required: true},
            {xtype: 'textfield', name: 'brand', label: 'Brand', required: true},
            {xtype: 'textfield', name: 'sku', label: 'SKU'},
            {xtype: 'textfield', name: 'price', label: 'Price'},
            {xtype: 'textfield', name: 'quantity', label: 'Quantity'}
        ],
        'Customer': [
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

    function initRhosync() {

        function buildModelsList(data) {
            Ext.regModel('ModelSelectionItem', {
                fields: [{name: 'name', type: 'string'}]
            });
            var store = new Ext.data.Store({
                autoLoad: true,
                model: 'ModelSelectionItem',
                data : data,
                proxy: {
                    type: 'memory',
                    reader: {
                        type: 'json',
                        root: 'items'
                    }
                }
            });
            var list = new Ext.List({
                id: 'ModelList',
                fullscreen: false,
                itemTpl: '{name}',
                store: store//,
            });
            list.on('itemtap', function(list, index, item, evt){
                var record = list.getRecord(item);
                showObjects(record);
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
                showForm(record);
            });
            list.on('show', function(){
                var createButton = Ext.getCmp('createButton');
                createButton.show();
                createButton.doComponentLayout();
                createButton.setHandler(function(btn) {
                    //var record = Ext.ModelMgr.create({}, model.name);
                    var record = store.add({})[0];
                    showForm(record);
                });
            });
            list.on('hide', function(){
                var createButton = Ext.getCmp('createButton');
                createButton.hide();
                createButton.doComponentLayout();
            });
            return list;
        }

        function buildFormFor(model) {
            //var modelName = record.store.model.modelName;

            var submitItem = {xtype: 'button', text: 'Save', handler: function(btn) {
                var form = Ext.getCmp(model.name+'Form');
                doUpdate(form);
            }};

            var form = new Ext.form.FormPanel({
                id: model.name+'Form',
                scroll: 'vertical',
                items: editForms[model.name].concat(submitItem)
            });

            form.on('show', function(){
                var deleteButton = Ext.getCmp('deleteButton');
                deleteButton.show();
                deleteButton.doComponentLayout();
                deleteButton.setHandler(function(btn) {
                    doDelete(form);
                });
            });
            form.on('hide', function(){
                var deleteButton = Ext.getCmp('deleteButton');
                deleteButton.hide();
                deleteButton.doComponentLayout();
            });
            return form;
        }

        var pgs = [];
        var modelsData = {items:[]};

        $.each(modelDefinitions, function(idx, model){
            Ext.regModel(model.name, model);
            var store = buildStoreFor(model);
            var list = buildListFor(model, store, displayTemplates[model.name]);
            var form = buildFormFor(model);
            pgs.push(list);
            pgs.push(form);
            modelsData.items.push({name: model.name});
        });

        var list = buildModelsList(modelsData);
        allPages = [list].concat(pgs);

        return RhoSync.init(modelDefinitions/*, 'native'*/);
    }

    function showObjects(record) {
        var modPanel = Ext.getCmp('modelsPanel');
        modPanel.getLayout().forth(record.data.name +'List', null /*use default animation*/, record.data.name);
    }

    function showForm(record) {
        var modelName = record.store.model.modelName;
        var form = Ext.getCmp(modelName+'Form');
        form.loadRecord(record);

        var title = 'Product' == modelName
                ? record.data.brand +' ' +record.data.name
                : record.data.first +' ' +record.data.last;

        title = (title && title.replace(' ', '')) ?  title : 'New ' +modelName;

        

        var modPanel = Ext.getCmp('modelsPanel');
        modPanel.getLayout().forth(form.id, null /*use default animation*/, title);
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
            Ext.getCmp('mainPanel').setActiveItem('modelsPanel');
            Ext.getCmp('logoutButton').show();
            Ext.getCmp('syncButton').enable();
        } else {
            Ext.getCmp('mainPanel').setActiveItem('loginForm');
            Ext.getCmp('logoutButton').hide();
            Ext.getCmp('syncButton').disable();
        }
        Ext.getCmp('mainPanel').doLayout();

        // Navigate back to the root list of models
        var modPanel = Ext.getCmp("modelsPanel");
        while(!modPanel.getLayout().isHistoryEmpty()) {
            modPanel.getLayout().back();
        }
        modPanel.doLayout();
    }

    function reloadLists() {
        $.each(modelDefinitions, function(i, model) {
            Ext.getCmp(model.name +'List').store.read();
        });
    }

    function doSync(){
        var msg = Ext.Msg.alert('Synchronizing now', 'Wait please..', Ext.emptyFn);
        RhoSync.syncAllSources().done(function(){
            //if (activeList) activeList.store.sync();
            msg.hide();
            reloadLists();
        }).fail(function(errCode, err){
            showError('Synchronization error', errCode, err);
        });
    }

    function doUpdate(form) {
        var record = form.getRecord();
        var store = record.store;
        form.updateRecord(record, true);
        store.sync();
        Ext.getCmp('modelsPanel').getLayout().back();
    }

    function doDelete(form){
        Ext.Msg.confirm('Delete object', 'Are you sure?', function(yn){
            if ('yes' == yn.toLowerCase()) {
                var record = form.getRecord();
                var store = record.store;
                store.remove(record);
                store.sync();
                Ext.getCmp('modelsPanel').getLayout().back();
            }
        });
    }

    function initUI() {

        var logoutButton = new Ext.Button({
            id: 'logoutButton',
            text: 'Logout',
            handler: doLogout
        });

        var  backButton = new Ext.Button({
            id: 'backButton',
            text: 'Back',
            ui: 'back',
            hidden: true,
            handler: function() {
                modelsPanel.getLayout().back();
            }
        });

        var syncButton = new Ext.Button({
            id: 'syncButton',
            text: 'Sync',
            handler: doSync
        });

        var createButton = new Ext.Button({
            id: 'createButton',
            text: 'Create new',
            hidden: true
        });

        var deleteButton = new Ext.Button({
            id: 'deleteButton',
            text: 'Delete',
            hidden: true,
            handler: doDelete
        });

        var loginForm = new Ext.form.FormPanel({
            id: 'loginForm',
            fullscreen: true,
            standardSubmit: false,
            dockedItems: [
                {
                    id: 'loginToolbar',
                    xtype: 'toolbar',
                    dock : 'top',
                    title: 'Sign in'
                }
            ],
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
                        doLogin(loginForm.getValues().login, loginForm.getValues().password);
                    }
                }
            ],

            EOF: true
        });

        var modelsPanel = new Ext.Panel({
            id: 'modelsPanel',
            fullscreen: true,
            layout: {
                xtype: 'layout',
                type:'cardhistory',
                defaultAnimation: 'slide',
                getTitle: function(){
                    return Ext.getCmp('modelsToolbar').titleEl.getHTML();
                },
                setTitle: function(text){
                    Ext.getCmp('modelsToolbar').setTitle(text);
                },
                setBack: function(isVisible, text) {
                    var back = Ext.getCmp("backButton");
                    back.setVisible(isVisible);
                    if (text) {
                        back.setText(text);
                    }
                    back.doComponentLayout();
                }
            },
            dockedItems: [
                {
                    id: 'modelsToolbar',
                    xtype: 'toolbar',
                    dock : 'top',
                    title: 'Model',
                    items: [
                        backButton,
                        {xtype: 'spacer'},
                        {xtype: 'spacer'},
                        createButton,
                        deleteButton,
                        logoutButton,
                        syncButton
                    ]
                }
            ],
            items: allPages
        });

        var mainPanel = new Ext.Panel({
            id: 'mainPanel',
            fullscreen: true,
            layout: 'card',
            items: [loginForm, modelsPanel]
        });

        updateLoggedInState();
    }

})(jQuery, Ext);
