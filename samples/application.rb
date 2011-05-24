#require 'rubygems' if RUBY_VERSION < "1.9"
require 'sinatra'

class RhoSyncJSDemoApp < Sinatra::Base
  set :static, true

  get '/samples/rhosync-sencha' do
    erb :'rhosync-sencha'
  end
end
