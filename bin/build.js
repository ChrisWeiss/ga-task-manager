/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Modifications Copyright (C) 2018 Anki, Inc.
 */


/* eslint-env node */
/* eslint require-jsdoc: "off" */


const fs = require('fs-extra');
const glob = require('glob');
const {compile}= require('google-closure-compiler-js');
const {rollup} = require('rollup');
const nodeResolve = require('rollup-plugin-node-resolve');
const path = require('path');
const {SourceMapGenerator, SourceMapConsumer} = require('source-map');


module.exports = (output) => {
  const entry = path.resolve(__dirname, '../lib/index.js');
  const plugins = [nodeResolve()];
  return new Promise((resolve, reject) => {
    rollup({entry, plugins}).then((bundle) => {
      try {
        const rollupResult = bundle.generate({
          format: 'es',
          dest: output,
          sourceMap: true,
        });

        const externsDir = path.resolve(__dirname, '../lib/externs');
        const externs = glob.sync(path.join(externsDir, '*.js'))
            .reduce((acc, cur) => acc + fs.readFileSync(cur, 'utf-8'), '');

        const closureFlags = {
          jsCode: [{
            src: rollupResult.code,
            path: path.basename(output),
          }],
          compilationLevel: 'ADVANCED',
          useTypesForOptimization: true,
          outputWrapper:
              '(function(){%output%})();\n' +
              `//# sourceMappingURL=${path.basename(output)}.map`,
          assumeFunctionWrapper: true,
          rewritePolyfills: false,
          warningLevel: 'VERBOSE',
          createSourceMap: true,
          externs: [{src: externs}],
        };

        const closureResult = compile(closureFlags);
        if (closureResult.errors.length || closureResult.warnings.length) {
          const rollupMap = new SourceMapConsumer(rollupResult.map);

          // Remap errors from the closure compiler output to the original
          // files before rollup bundled them.
          const remap = (type) => (item) => {
            let {line, column, source} = rollupMap.originalPositionFor({
              line: item.lineNo,
              column: item.charNo,
            });
            source = path.relative('.', path.resolve(__dirname, '..', source));
            return {type, line, column, source, desc: item.description};
          };


          reject({
            errors: [
              ...closureResult.errors.map(remap('error')),
              ...closureResult.warnings.map(remap('warning')),
            ],
          });
        } else {
          // Currently, closure compiler doesn't support applying its generated
          // source map to an existing source map, so we do it manually.
          const fromMap = JSON.parse(closureResult.sourceMap);
          const toMap = rollupResult.map;

          const generator = SourceMapGenerator.fromSourceMap(
              new SourceMapConsumer(fromMap));

          generator.applySourceMap(
              new SourceMapConsumer(toMap), path.basename(output));

          const sourceMap = generator.toString();

          resolve({
            code: closureResult.compiledCode,
            map: sourceMap,
          });
        }
      } catch(err) {
        reject(err);
      }
    }).catch(reject);
  });
};
