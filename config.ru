require 'sinatra'
require 'samples/application'

RhoConnectJSDemoApp.set :public, File.dirname(__FILE__) + '/'
RhoConnectJSDemoApp.set :views, File.dirname(__FILE__) + '/samples'

run RhoConnectJSDemoApp.new
