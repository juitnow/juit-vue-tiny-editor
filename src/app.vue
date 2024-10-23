<template>
  <div class="demo">
    <form>
      <input id="editable" v-model="editable" type="checkbox">
      <label for="editable">editable</label>
      -
      <button :style="{ 'font-weight': isBold ? 'bold' : 'normal' }" :disabled="! hasSelection" @click.prevent="editor?.bold()">
        BOLD
      </button>
      &nbsp;
      <button :style="{ 'font-style': isItalic ? 'italic' : 'normal' }" :disabled="! hasSelection" @click.prevent="editor?.italic()">
        ITALIC
      </button>
      -
    </form>
    <tiny-edit
      ref="editor"
      v-model="html"
      class="tiny-edit"
      :editable="editable"
      @is-bold="isBold = $event"
      @is-italic="isItalic = $event"
      @has-selection="hasSelection = $event"
    />
    <div style="background-color: #fee;">
      &nbsp;
    </div>
    <pre>{{
      html
        .replaceAll('\n', '\u21b2\n')
        .replaceAll(' ', '\u2423')
        .replaceAll('\u200b', '\u2425')
    }}</pre>
    <link rel="mention" href="https://www.google.com/">
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import TinyEdit from '../lib/editor.vue'


const editor = ref<InstanceType<typeof TinyEdit>>()
const editable = ref(true)

const isBold = ref(false)
const isItalic = ref(false)
const hasSelection = ref(false)

const html = ref(`hello, world!
this <b>is a</b> ne<b>wli</b>ne
this is <i>some</i> text
foo<mention contenteditable="false" ref="mailto:pier">gonzo</mention>flipper
<div>this is a div</div>
<p>this is a paragraph</p>
another line`)

watch(editor, (newEditor, oldEditor) => {
  console.log('NEW', !! newEditor, 'OLD', !! oldEditor)
  if (newEditor) console.log('model', newEditor, newEditor)
}, { immediate: true })


</script>

<style lang="pcss" scoped>
.demo {
  font-family: Arial, Helvetica, sans-serif;
}
.tiny-edit {
  margin-top: 10px;
  border: 1px solid #ccc;
  height: 30em;
  padding: 3px;
}

pre {
  margin-top: 10px;
  background-color: #efe;
  border: 1px solid #ccc;
  height: 30em;
  padding: 3px;
}
</style>
