var map = null;
var definedModels = {};
var username = null;
var password = null;
var syncInterval = null;
var current_model = null;
var html = "<div id='list-data'></div>";

// jQuery('div').live('pagehide', function(event, ui){
//   var page = jQuery(event.target);
// 
//   if(page.attr('data-cache') == 'never'){
//     page.remove();
//   };
// });

onLoad = (function($) {


    // let's start here
    function mapPages() {
		
        // iPhone emu doesn't support this PhoneGap event, so it just commented out.
        //document.addEventListener("deviceready", function(){ 
		$('a#login').live('tap',function(event){
			setNames();
			//initDeviceId();
            loginRhoConnect(username, password).done(function(){
				sync();
				$.mobile.changePage("#home", "slideup");
	            attach_events();
			$('.greeting').replaceWith("<h1 style='text-align:center'>Welcome " + username + '</h1>');
            }).fail(function(errCode){
				$('.login-error').replaceWith("<div class='login-error'>Error logging in" + errCode + "</div>");
				$('.login-error').fadeOut(3000);
			})
		})
       //}, false);
    }
	
	function attach_events() {
		$('a#tasks').live('tap',function(event){
			pull_data('Task');
		})
		$('a#leads').live('tap',function(event){
			pull_data('Lead');
		})
		$('a#accounts').live('tap',function(event){
			pull_data('Account');
		})
		$('a#contacts').live('tap',function(event){
			pull_data('Contact');
		})
		$('a#opportunities').live('tap',function(event){
			pull_data('Opportunity');
		})
		$('a#sync').live('tap',function(event){
			sync();
		})
		$('a#logout').live('tap',function(event){
			logout();
		})
		$('a#ftr-home').live('tap',function(event){
			$.mobile.changePage("#home", "slideup");
		})
		$('#create').live('tap',function(event){
			create_obj();
		})
		$('a#new_form').live('tap',function(event){
			var rec = null;
			form = get_form_html(rec);
			html = "<form action='#' id='form-create'>" + form + "</form>";
			$('#form-create').replaceWith(html);
			$('.form-header').replaceWith("<div class='form-header' style='text-align:center'>New " + current_model + "</div>")
			$('#form-create').page();
			$.mobile.changePage("#form-new", "slideup");
		})
	}
	
	function create_obj(){
		var record = null;
		
		var model = RhoConnect.dataAccessObjects()[current_model];
		var f = $('#form-create').serializeArray()
		record = new model();
		for(var i=0;i < f.length; i++) {
			record[f[i].name] = f[i].value;
		}
		record['user_id'] = get_user_id(username);
		persistence.add(record);	
		persistence.flush();
        persistence.saveToRhoConnect(function() {
            alert("New " + current_model + " saved successfully!");
        });
		
		$.mobile.changePage("#home", "slideup");
	}
	
	function get_current_model(){
		return current_model;
	}
	
	function logout(){
		RhoConnect.logout().done(function(){
			var map = null;
			var definedModels = {};
			var username = null;
			var password = null;
			var syncInterval = null;
			var current_model = null;
			var html = "<div id='list-data'></div>";
			$.mobile.changePage("#form", "slideup");
		}).fail(function(errCode){
			alert('Logout error: ' +errCode);
		})
	}
	
	function sync(){
		RhoConnect.syncAllSources().done(function(){
			alert('sync successful');
		}).fail(function(errCode, err){
			alert('Data sync error: ' +errCode);
	    });
	}
	
	function delete_object(id){
		var model   = RhoConnect.dataAccessObjects()[current_model];
		var del_rec = null;
		model.all().each(null, function(record){
			if(record._rhoId == id){
				del_rec = record;
				return;
			}
		})
		if(del_rec != null){
			persistence.remove(del_rec);		
			persistence.flush();
	        persistence.saveToRhoConnect(function() {
	            alert(current_model + " deleted successfully!");
	        });
			$.mobile.changePage("#home", "slideup");
		}
		else {
			alert('could not find record ' + id);
		}
	}
	
	function update_object() {
		var rec = null;
		
		var model = RhoConnect.dataAccessObjects()[current_model];
		var f     = $('#form-create').serializeArray();
		var len   = f.length - 1;
		model.all().each(null, function(record){
			if(record._rhoId == f[len].value){
				rec = record;
				return;
			}
		})
		if(rec != null) {
			for(var i=0;i < f.length; i++) {
				if(rec[f[i].name] != undefined && rec[f[i].name].match(/(_at)/)  == null){
					rec[f[i].name] = f[i].value;
				}
			}	
			persistence.flush();
	        persistence.saveToRhoConnect(function() {
	            alert(current_model + " updated successfully!");
	        });
		}
		else {
			alert("error updating record");
		}
		$.mobile.changePage("#home", "slideup");
	}
	
	
	
	function edit_object(id){
		var model   = RhoConnect.dataAccessObjects()[current_model];
		var rec = null;
		model.all().each(null, function(record){
			if(record._rhoId == id){
				rec = record;
				return;
			}
		})
		if(rec != null) {
			form = get_form_html(rec);
			html = "<form action='#' id='form-create'>" + form + "</form>";
			$('#form-create').replaceWith(html);
			$('.form-header').replaceWith("<div class='form-header' style='text-align:center'>Update " + current_model + "</div>");
			$('#form-create').page();
			$.mobile.changePage("#form-new", "slideup");
			$('#update').live('tap', function(){
				update_object();
			})
		}
	}

	function pull_data(model) {
		var store = RhoConnect.dataAccessObjects()[model];
		
		current_model = model;
		persistence.loadFromRhoConnect(function() {
            storeLoaded();
        });
		
	    function storeLoaded() {
		    html = "";
			html = "<div id='list-data'><div id='d-list' data-role='collapsible-set'>";
			store.all().each(null, function(record){
				html += "<div data-role='collapsible' data-collapsed='false'><h3>"+ get_title(record) + "</h3> \
						<a id='edit' rhoId='" + record._rhoId + "' href='#' data-role='button' data-theme='e'>edit</a><fieldset class='ui-grid-a' > \
						<a id='delete' rhoId='" + record._rhoId + "' href='#' data-role='button' data-icon='minus' data-theme='f'>delete</a><fieldset class='ui-grid-a' >";
				for( var j=0; j<fields.length; j++){
				  if( record[fields[j]] != undefined ) {
				  	html += "<div class='ui-block-a'><div class='ui-bar ui-bar-c' style='height:40px;text-align:center'>"+ 
							fields[j] +"</div></div><div class='ui-block-b'><div class='ui-bar ui-bar-c' style='height:40px;text-align:center'>" + 
							format_field(record[fields[j]],fields[j]) + "</div></div>"; 
				  }
				}
				html += "</fieldset></div>"
	        });
	        html += "</div></div>"
			$('#list-data').replaceWith(html);
			$('a#delete').live('tap',function(){
				delete_object($(this).attr('rhoId'));
			});
			$('a#edit').live('tap',function(){
				edit_object($(this).attr('rhoId'));
			});
			$('#list-data').page();
			$.mobile.changePage('#list',"slideup");
		}
	}
	
	function get_title(record){
		if(current_model == 'Lead' || current_model == 'Contact'){
			return record['first_name'] + " " + record['last_name'];
		}
		else {
			return record['name'];
		}
	}

	
	function format_field(value,key) {
		if(key.match(/(_at)/)  != null && value.length > 0){
			value = parseInt(value) * 1000
			return new Date(value).toLocaleDateString();
		}
		else {return value;}
	}

	function setNames(){
        username = $('input#username')[0].value;
        password = $('input#password')[0].value;    
    }

	function get_user_id(username){
		var store = RhoConnect.dataAccessObjects()['User'];
		var result = false;
		store.all().each(null, function(record){
			if(record.username == username) {
				result = record._rhoId;
			}
		})
		return result;
	}

	function get_form_html(rec){
		var submit_type     = "create";
		var html    	    = ""
		var first 		    = "";
		var last  		    = "";
		var email 		    = "";
		var rhoId 		    = "";
		var name  		    = "";
		var stage 		    = "";
		var probability     = "";
		var background_info = "";
	
		if(current_model == 'Contact'){
			if(rec != null){
				first = rec.first_name;
				last  = rec.last_name;
				email = rec.email;
				rhoId = rec._rhoId;
				var submit_type = 'update';
			}
			html += "<div data-role='fieldcontain'> \
	            <label for='first_name'>first name</label> \
	            <input type='text' name='first_name' id='first_name' value='"+ first + "'/> \
	            <label for='last_name'>last name</label> \
	            <input type='text' name='last_name' id='last_name' value='" + last + "'/> \
				<label for='email'>email</label> \
				<input type='text' name='email' id='email' value='" + email + "'/> \
				<input type='hidden' name='rhoId' id='rhoId' value='"+ rhoId + "'/> \
	            <a id='" + submit_type + "' href='#' data-role='button'>" + submit_type + "</a> \
	        </div>"
		}
		if(current_model == 'Lead'){
			if(rec != null){
				first = rec.first_name;
				last  = rec.last_name;
				email = rec.email;
				rhoId = rec._rhoId;
				submit_type = 'update';
			}
			html += "<div data-role='fieldcontain'> \
	            <label for='first_name'>first name</label> \
	            <input type='text' name='first_name' id='first_name' value='" + first + "'/> \
	            <label for='last_name'>last name</label> \
	            <input type='text' name='last_name' id='last_name' value='" + last + "'/> \
				<label for='email'>email</label> \
				<input type='text' name='email' id='email' value='" + email + "'/> \
				<div data-role='fieldcontain'> \
					<label for='select-choice-1' class='select'>status</label> \
					<select name='status' id='status'> \
						<option value='New'>New</option> \
						<option value='Contracted'>Contracted</option> \
						<option value='Rejected'>Rejected</option> \
					</select></div> \
				<div data-role='fieldcontain'> \
					<label for='select-choice-2' class='select'>source</label> \
					<select name='source' id='source'> \
						<option value='other'>other</option> \
						<option value='word of mouth'>word of mouth</option> \
						<option value='website'>website</option> \
						<option value='website'>self generated</option> \
						<option value='referral'>referral</option> \
						<option value='online marketing'>online marketing</option> \
						<option value='conference'>conference</option> \
						<option value='cold call'>cold call</option> \
						<option value='campaign'>campaign</option> \
					</select></div> \
					<input type='hidden' name='rhoId' id='rhoId' value='"+ rhoId + "'/> \
					<a id='" + submit_type + "' href='#' data-role='button'>" + submit_type + "</a> \
	        </div>"
		}
		else if(current_model == 'Opportunity') {
			if(rec != null){
				name = rec.name;
				stage  = rec.stage;
				probability = rec.probability;
				rhoId = rec._rhoId;
				submit_type = 'update';
			}
			html += "<div data-role='fieldcontain'> \
	            <label for='name'>name</label> \
	            <input type='text' name='name' id='name' value='" + name + "'/> \
				<div data-role='fieldcontain'> \
					<label for='select-choice-2' class='select'>stage</label> \
					<select name='stage' id='stage'> \
						<option value='prospecting'>prospecting</option> \
						<option value='analysis'>analysis</option> \
						<option value='presentation'>presentation</option> \
						<option value='proposal'>proposal</option> \
						<option value='negotiation'>negotiation</option> \
						<option value='final_review'>final_review</option> \
						<option value='won'>closed/won</option> \
						<option value='lost'>closed/lost</option> \
				    </select></div> \
				<label for='probability'>probability</label> \
				<input type='text' name='probability' id='probability' value='" + probability + "'/> \
				<input type='hidden' name='rhoId' id='rhoId' value='"+ rhoId + "'/> \
	            <a id='" + submit_type + "' href='#' data-role='button'>" + submit_type + "</a> \
	        </div>"
		}
		else if(current_model == 'Task') {
			var store = RhoConnect.dataAccessObjects()['User'];
			if(rec != null){
				name = rec.name;
				background  = rec.background_info;
				rhoId = rec._rhoId;
				submit_type = 'update';
			}
			html += "<div data-role='fieldcontain'> \
	            <label for='name'>name</label> \
	            <input type='text' name='name' id='name' value='" + name + "'/> \
				<div data-role='fieldcontain'> \
					<label for='select-choice-1' class='select'>user</label> \
					<select name='user_id' id='user_id'>" 
					
			store.all().each(null, function(record){
				html += "<option value='" + record.rhoId + "'>" + record.username + "</option>"
			})
			
			html += "</select></div> <label for='background_info'>background info</label> \
				<textarea cols='40' rows='8' name='background_info' id='background_info'>" + background + "</textarea> \
				<div data-role='fieldcontain'> \
				<label for='select-choice-2' class='select'>category</label> \
				<select name='category' id='category'> \
					<option value='call'>call</option> \
					<option value='email'>email</option> \
					<option value='follow_up'>follow-up</option> \
					<option value='lunch'>lunch</option> \
					<option value='meeting'>meeting</option> \
					<option value='money'>money</option> \
					<option value='presentation'>presentation</option> \
					<option value='trip'>trip</option> \
				</select></div> \
				<div data-role='fieldcontain'> \
				<label for='select-choice-1' class='select'>due</label> \
				<select name='bucket' id='bucket'> \
					<option value='due_asap'>as soon as possible</option> \
					<option value='due_today'>today</option> \
					<option value='due_tomorrow'>tomorrow</option> \
					<option value='due_this_week'>this week</option> \
					<option value='due_next_week'>next week</option> \
					<option value='due_later'>sometime later</option> \
				</select></div> \
				<input type='hidden' name='rhoId' id='rhoId' value='"+ rhoId + "'/> \
	            <a id='" + submit_type + "' href='#' data-role='button'>" + submit_type + "</a> \
	        	</div>"
		}
		else if(current_model == 'Account') {
			if(rec != null){
				name = rec.name;
				stage  = rec.email;
				rhoId = rec._rhoId;
				submit_type = 'update';
			}
			html += "<div data-role='fieldcontain'> \
	            <label for='name'>name</label> \
	            <input type='text' name='name' id='name' value='" + name + "'/> \
				<div data-role='fieldcontain'> \
	            <label for='select-choice-1' class='select'>category</label> \
				<select name='category' id='category'> \
					<option value='other'>other</option> \
					<option value='affiliate'>affiliate</option> \
					<option value='competitor'>competitor</option> \
					<option value='customer'>customer</option> \
					<option value='partner'>partner</option> \
					<option value='reseller'>reseller</option> \
					<option value='vendor'>vendor</option> \
				</select></div> \
				<label for='email'>email</label> \
				<input type='text' name='email' id='email' value='" + email + "'/> \
				<input type='hidden' name='rhoId' id='rhoId' value='"+ rhoId + "'/> \
	            <a id='" + submit_type + "' href='#' data-role='button'>" + submit_type + "</a> \
	        </div>"
		}
		return html;
	}

    // var myUuid = null;
    //     var myName = null;
    // 
    //     function initDeviceId() {
    // 	//phonegap emulator issue will always cause device to be undefined, uncomment lines 10, 20 for real phone
    //         if ("undefined" != typeof device && (!myUuid || !myName)) {
    //             myUuid = device['uuid'];
    //             myName = device['name'];
    // 
    //             //alert('Device uuid: ' + myUuid);
    //             //alert('Device name: ' + myName);
    //         } else {
    //             myUuid = 'UNDEFINED';
    //             myName = 'UNDEFINED';
    //         }
    //     }

    var fields = [
					'user_id','assigned_to','completed_by','name','asset_id','priority','category','bucket',
					'due_at','completed_at','deleted_at','created_at','updated_at','background_info','campaign_id',
					'first_name','last_name','title','company','status','email','lead_id','probability','closes_on', 'source'
				]
		
    var modelDefinitions = [
		{
            name: 'User',
            fields: [
				{name: 'username',    	type: 'string'},
                {name: 'email',			type: 'string'},
                {name: 'first_name',	type: 'string'},
                {name: 'last_name',   	type: 'string'},
                {name: 'title',   		type: 'string'},
                {name: 'company', 		type: 'string'},
				{name: 'created_at',   	type: 'string'},
				{name: 'updated_at',   	type: 'string'}
            ]
	   },
	   {
            name: 'Task',
            fields: [
				{name: 'user_id',    	type: 'string'},
                {name: 'assigned_to',	type: 'string'},
                {name: 'completed_by',	type: 'string'},
                {name: 'name',   		type: 'string'},
                {name: 'asset_id',   	type: 'string'},
                {name: 'priority', 		type: 'string'},
                {name: 'category',    	type: 'string'},
                {name: 'bucket',   		type: 'string'},
                {name: 'due_at',     	type: 'string'},
                {name: 'completed_at',  type: 'string'},
                {name: 'deleted_at',    type: 'string'},
				{name: 'created_at',   	type: 'string'},
				{name: 'updated_at',   	type: 'string'},
				{name: 'background_info',   type: 'string'}
            ]
        },
   		{
   			name: 'Lead',
   			fields: [
   				{name: 'user_id',		type: 'string'},
   				{name: 'campaign_id',	type: 'string'},
   				{name: 'assigned_to',	type: 'string'},
   				{name: 'first_name',	type: 'string'},
   				{name: 'last_name',		type: 'string'},
   				{name: 'title',			type: 'string'},
   				{name: 'company',		type: 'string'},
   				{name: 'status',		type: 'string'},
   				{name: 'email',			type: 'string'},
   				{name: 'created_at',	type: 'string'}
   			]
   		},
   		{
   			name: 'Contact',
   			fields: [
   				{name: 'user_id',		type:'string'},
   				{name: 'lead_id',		type:'string'},
   				{name: 'assigned_to',	type:'string'},
   				{name: 'first_name',	type:'string'},
   				{name: 'last_name',		type:'string'},
   				{name: 'title',			type:'string'},
   				{name: 'email',			type:'string'},
   				{name: 'created_at',	type:'string'}
   			]
   		},
   		{
   			name: 'Opportunity',
   			fields: [
   				{name: 'name',			type:'string'},
   				{name: 'user_id',		type:'string'},
   				{name: 'campaign_id',	type:'string'},
   				{name: 'assigned_to',	type:'string'},
   				{name: 'probability',	type:'string'},
   				{name: 'closes_on',		type:'string'},
   				{name: 'created_at',	type:'string'},
   				{name: 'stage',			type:'string'}
   			]
   		},
   		{
   			name: 'Account',
   			fields: [
   				{name: 'user_id',		type:'string'},
   				{name: 'assigned_to',	type:'string'},
   				{name: 'name',			type:'string'},
   				{name: 'email',			type:'string'},
   				{name: 'created_at',	type:'string'}
   			]
   		}
		
    ];

    function loginRhoConnect(username, password) {
		persistence.store.rhoconnect.config(persistence);

        return $.Deferred(function(dfr){
            RhoConnect.login(username, password,
                    new RhoConnect.SyncNotification(), true /*do db init*/).done(function(){
                // Init DB for the user on success
                initRhoconnect(username, false).done(function(){
                    dfr.resolve();
                }).fail(function(errCode, err){
                    alert('DB init error: ' +errCode);
                    dfr.reject(errCode, err);
                });
            }).fail(function(errCode, err){
                //alert('RhoConnect login error: ' +errCode);
                dfr.reject(errCode, err);
            });
        }).promise();
    }

    // RhoConnect.js initialization
    function initRhoconnect(username, doReset) {
        return RhoConnect.init(modelDefinitions, 'persistencejs', doReset);
    }
	

    return mapPages;
})(jQuery);
