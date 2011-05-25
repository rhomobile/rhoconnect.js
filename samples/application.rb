class RhoSyncJSDemoApp < Sinatra::Base
  set :static, true

  get '/samples/rhosync-sencha' do
    erb :'rhosync-sencha'
  end
end
