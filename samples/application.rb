class RhoSyncJSDemoApp < Sinatra::Base
  set :static, true

  get '/' do
    erb :index
  end

  get '/samples/rhosync-sencha' do
    erb :'rhosync-sencha'
  end
end
