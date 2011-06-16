#require 'rubygems'
#require 'bundler'
#Bundler.setup(:default, :test)
#require 'bundler/gem_tasks'
require 'rspec/core/rake_task'

require 'find'
require 'erb'
#require 'rake/rdoctask'
require 'digest/sha2'
require 'rexml/document'

#Look, another big fat hack. Make it so we can remove tasks from rake -T by setting comment to nil
module Rake
  class Task
    attr_accessor :comment
  end
end

$app_basedir = pwd
chdir File.dirname(__FILE__)

ver = File.read("version.txt").chomp.gsub(/\./, "_").gsub(/,/, "_")

src_dir = "js"
build_dir = "build"
dist_dir = "distrib"
samples_dir = "samples"

max_name = "rhoconnect-"+ver+".js"
min_name = "rhoconnect-"+ver+".min.js"
max_ext_name = "rhoconnect.ext-"+ver+".js"
min_ext_name = "rhoconnect.ext-"+ver+".min.js"
zip_name = "rhoconnect-"+ver+".zip"

desc "Build rhoconnect.js client package"
task :clean do
  rm_rf dist_dir
end

task :test do
  puts "pending ..."
end


namespace "build" do

  desc "Build rhoconnect.js client package"
  task :rhoconnect_js do

    mkdir_p dist_dir

    #cp_r src_dir, tmp_dir, :preserve => true

    modnames = [
        "rhoconnect.js",
        "rhoconnect.common.js",
        "rhoconnect.protocol.js",
        "rhoconnect.domain.js",
        "rhoconnect.storage.js",
        "rhoconnect.engine.js",
        "rhoconnect.notify.js",
        "rhoconnect.plugin-extjs.js",
        "rhoconnect.plugin-persistencejs.js"
    ]

    File.open(dist_dir+"/"+max_name, "w") do |of|
      modnames.each do |modname|
        File.open(src_dir +"/" +modname, "r") do |mf|
          mf.readlines.each do |str|
            of.puts(str)
          end
        end
      end
    end

    max_pathname = dist_dir+"/"+max_name
    min_pathname = dist_dir+"/"+min_name
    zip_pathname = dist_dir+"/"+zip_name

    puts `java -jar #{build_dir}/google-compiler.jar --compilation_level WHITESPACE_ONLY --js #{max_pathname} --warning_level QUIET --js_output_file #{min_pathname}`
    puts `jar cvMf #{zip_pathname} -C #{dist_dir} #{max_name} -C #{dist_dir} #{min_name}`
    Dir.foreach samples_dir do |dir|
      if !/(apk)|(\.)|(\.\.)/.match(dir)
        target = samples_dir+"/"+dir+"/js/"
        cp max_pathname, target
        cp min_pathname, target
      end
    end

  end
end

desc "Run all specs"
task :spec do
end
#RSpec::Core::RakeTask.new(:spec) do |t|
#  t.rspec_opts = ["-b", "-c", "-fd"]
#  t.pattern = 'spec/**/*_spec.rb'
#end

desc "Run all specs with rcov"
task :rcov do
end
#RSpec::Core::RakeTask.new(:rcov) do |t|
#  t.rcov = true
#  t.rspec_opts = ["-b", "-c", "-fd"]
#  t.rcov_opts =  ['--exclude', 'spec/*,gems/*']
#end

task :default => :spec
