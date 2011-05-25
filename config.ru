require 'sinatra'
require 'samples/application'

RhoSyncJSDemoApp.set :public, File.dirname(__FILE__) + '/'
RhoSyncJSDemoApp.set :views, File.dirname(__FILE__) + '/samples'

run RhoSyncJSDemoApp.new
