class RhoConnectJSDemoApp < Sinatra::Base
  set :static, true

  get '/' do
    erb :index
  end

  get '/samples/rhoconnect-sencha' do
    erb :'rhoconnect-sencha'
  end
end
