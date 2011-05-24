#require 'rubygems' if RUBY_VERSION < "1.9"
require 'sinatra'

class RhoSyncJSDemoApp < Sinatra::Base
  set :static, true
#  set :public, File.dirname(__FILE__) + '../'
end
