Juit Tiny Editor (for mentions!)
================================

A simple Vue component providing an editable text area supporting bold, italic,
links and mentions.

Look here for a simple [demo](https://juitnow.github.io/juit-vue-tiny-editor/).

#### Model

The `v-model` of the component contains the HTML produced by the editor, and
can be used to inject the initial text to be edited.

#### Props

* `editable`: A flag indicating whether editing is enabled or not.
* `dark`: A flag indicating whether the **dark** theme should be used in the
          editor or not.
* `placeholder`: The placeholder text to display when no content is available.
* `mentions`: A `Record<string, string>` of the available mentions to display
              in the editor. The _key_ will be the mention's `name`, and the
              _value_ will be the mention's `title`. When this property is
              `null` the mentions popup will display a loader spinner.

#### Emits

* `mention`: The `string` of the mention being typed (for example `@x`).
* `submit`: When the send button is clicked, the `string` parameter will contain
            the HTML contents of the editor.

#### HTML format

The editor supports a very basic HTML format, with only `<b>`, `<i>` and
`<a href="...">` supported.

Mentions will be emitted as `<link rel="mention">` tags, with the `name`
attribute set the the mention's own name (the primary key of mentions) and
`title` as the user-visible value of the mention itself.

#### Legal Stuff

* [Copyright Notice](NOTICE.md)
* [License](LICENSE.md)
