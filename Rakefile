require 'find'
require 'erb'
require 'rake/rdoctask'
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
#tmp_name = "rhosync-"+ver+".tmp"
max_name = "rhosync-"+ver+".js"
min_name = "rhosync-"+ver+".min.js"

desc "Build rhosync.js client package"
task :clean do
  rm max_name if File.exists? max_name
  rm min_name if File.exists? min_name
end


namespace "build" do
  desc "Build rhosync.js client package"
  task :rhosync_js do

    src_dir = "js"
    build_dir = "build"
    tmp_dir = "tmp"

    #rm_rf tmp_dir

    rm max_name if File.exists? max_name
    rm min_name if File.exists? min_name

    #mkdir_p tmp_dir

    #cp_r src_dir, tmp_dir, :preserve => true

    modnames = [
        "rhosync.js",
        "rhosync.common.js",
        "rhosync.protocol.js",
        "rhosync.domain.js",
        "rhosync.storage.js",
        "rhosync.engine.js",
        "rhosync.notify.js"
    ]

    File.open(max_name, "w") do |of|
      modnames.each do |modname|
        File.open(src_dir +"/" +modname, "r") do |mf|
          mf.readlines.each do |str|
            of.puts(str)
          end
        end
      end
    end

    puts `java -jar build/google-compiler.jar --js #{max_name} --warning_level QUIET --js_output_file #{min_name}`
    #puts `java -jar build/yuicompressor-2.4.4.jar --type js #{tmp_name} >> #{min_name}`
    #rm tmp_name if File.exists? tmp_name
  end
end
