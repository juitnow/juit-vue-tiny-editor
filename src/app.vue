<template>
  <div class="demo">
    <form>
      <input id="editable" v-model="editable" type="checkbox">
      <label for="editable">editable</label>
      &nbsp;-&nbsp;
      <input
        id="dark"
        ref="darkRef"
        v-model="dark"
        type="checkbox"
        @click="themeSelected = true"
      >
      <label for="dark">dark mode</label>
      &nbsp;-&nbsp;
      <button @click.prevent="populate()">
        Sample Text
      </button>
    </form>
    <tiny-edit
      ref="editor"
      v-model="html"
      class="tiny-edit"
      :editable="editable"
      :mentions="mentions"
      :dark="dark"
      @mention="mention = $event"
      @submit="console.log('submitted', $event)"
    />

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
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import TinyEdit from '../lib/editor.vue'

const allMentions = {
  'frankie@example.com': 'Frankie Fowler',
  'penelope@example.org': 'Penelope Myers',
  'mateo@example.org': 'Mateo Ramos',
  'sebastian@example.org': 'Sebastian Fox',
  'nathan@example.org': 'Nathan Becker',
  'dominic@example.org': 'Dominic Lane',
  'ivy@example.org': 'Ivy Bennett',
  'theo@example.org': 'Theo Morris',
  'sofia@example.org': 'Sofia Russo',
  'elijah@example.org': 'Elijah Becker',
  'violet@example.org': 'Violet Perez',
  'zara@example.org': 'Zara Grant',
  'layla@example.org': 'Layla Morgan',
  'caleb@example.org': 'Caleb Foster',
  'jade@example.org': 'Jade Hawkins',
  'eva@example.org': 'Eva Castillo',
  'fiona@example.com': 'Fiona Fitzpatrick',
  'bella@example.org': 'Bella Sanders',
  'finn@example.com': 'Finn Franklin',
  'oscar@example.org': 'Oscar James',
  'leah@example.org': 'Leah Warren',
  'ava@example.org': 'Ava Simmons',
  'leila@example.org': 'Leila Nguyen',
  'flynn@example.com': 'Flynn Faulkner',
  'riley@example.org': 'Riley Kimura',
  'wesley@example.org': 'Wesley Rhodes',
  'declan@example.org': 'Declan Reed',
  'alice@example.org': 'Alice Young',
  'jonah@example.org': 'Jonah Blake',
  'dante@example.org': 'Dante Lopez',
  'isaac@example.org': 'Isaac Romero',
  'tristan@example.org': 'Tristan Cruz',
  'mia@example.org': 'Mia Collins',
  'daniel@example.org': 'Daniel Ortega',
  'olivia@example.org': 'Olivia Turner',
  'nora@example.org': 'Nora Patel',
  'felix@example.com': 'Felix Fletcher',
  'frances@example.com': 'Frances Fields',
  'iris@example.org': 'Iris Delgado',
  'peter@example.org': 'Peter Kim',
  'maxine@example.org': 'Maxine Palmer',
  'lucas@example.org': 'Lucas Hayes',
  'samuel@example.org': 'Samuel Clarke',
  'faith@example.com': 'Faith Finley',
  'aiden@example.org': 'Aiden Meyer',
  'sophie@example.org': 'Sophie Chen',
  'emily@example.org': 'Emily Walsh',
  'aria@example.org': 'Aria Hughes',
  'stella@example.org': 'Stella Bishop',
  'aurora@example.org': 'Aurora Caldwell',
  'hazel@example.org': 'Hazel Armstrong',
  'lily@example.org': 'Lily Novak',
  'fabian@example.com': 'Fabian Flores',
  'adrian@example.org': 'Adrian West',
  'benjamin@example.org': 'Benjamin Ford',
  'isabelle@example.org': 'Isabelle Reed',
  'gabriel@example.org': 'Gabriel Shaw',
  'francesca@example.com': 'Francesca Foster',
  'maya@example.org': 'Maya Watts',
  'aaron@example.org': 'Aaron Morales',
  'finn@example.org': 'Finn Reed',
  'ruby@example.org': 'Ruby Wallace',
  'julian@example.org': 'Julian Torres',
  'lila@example.org': 'Lila Evans',
  'chloe@example.org': 'Chloe Weber',
  'camila@example.org': 'Camila Lewis',
  'emma@example.org': 'Emma Park',
  'ethan@example.org': 'Ethan Brooks',
  'isla@example.org': 'Isla Murphy',
  'leo@example.org': 'Leo Grant',
  'grace@example.org': 'Grace Sutton',
  'jacob@example.org': 'Jacob Fisher',
  'farrah@example.com': 'Farrah Freeman',
  'nico@example.org': 'Nico Romano',
  'liam@example.org': 'Liam Bennett',
  'simon@example.org': 'Simon Drake',
  'lydia@example.org': 'Lydia Moreno',
  'mason@example.org': 'Mason Alvarez',
  'eden@example.org': 'Eden Paulson',
  'ella@example.org': 'Ella Roberts',
  'xavier@example.org': 'Xavier Gray',
  'owen@example.org': 'Owen Hughes',
  'amara@example.org': 'Amara Khan',
  'oliver@example.org': 'Oliver Cole',
}

function filter(value: string): Record<string, string> {
  const entries = Object
      .entries(allMentions)
      .filter(([ _, v ]) => v.toLowerCase().startsWith(value.toLowerCase()))
  return Object.fromEntries(entries)
}

const mention = ref()
const initial = ref('a')
const mentions = shallowRef<Record<string, string> | null>(filter(initial.value))

watch(mention, (mention) => mention && (initial.value = mention.slice(0, 1)))
watch(initial, (current) => {
  mentions.value = null
  setTimeout(() => mentions.value = filter(current), Math.random() * 2000)
})

const editor = ref<InstanceType<typeof TinyEdit>>()
const editable = ref(true)

const html = ref('')

function populate(): void {
  html.value = `This is some sample content...
Content can be <b>bold</b> or <i>italic</i> (or even <i><b>both</b></i>).
Mentions are supported, like <link rel="mention" name="simon@example.org" title="Simon Drake">.
Links are also supported, either parsed from text http://www.google.com/ ...
... or with <a href="http://www.google.com">proper <b>link</b> tags</a>.
`
}

/* ===== LIGHT/DARK SWITCHER ================================================ */

/** The media query determining whether OS-level dark mode is selected or not */
const query = window.matchMedia('(prefers-color-scheme: dark)')
/** The initial value of our "dark" theme, according to the OS */
const dark = ref(query.matches)
/** Whether the user _explicitly_ selected the "dark" or "light" theme */
const themeSelected = ref(false)
/** Reference to our checkbox selecting the "dark" or "light" theme */
const darkRef = ref<HTMLInputElement>()

/** Update the theme ("dark" or "light") according to OS changes */
function updateTheme(event: MediaQueryListEvent): void {
  themeSelected.value = false // the OS takes prececence
  dark.value = event.matches // select "dark" or "light" theme
}

/* Initial state of our theme on mount */
onMounted(() => {
  /* Update the theme according to the OS */
  query.addEventListener('change', updateTheme)

  const darkCheckbox = darkRef.value
  if (! darkCheckbox) throw new Error('Dark checkbox not found')

  /* Force the page's theme to "dark", "ligth" or reset to defaults */
  watch([ themeSelected, dark ], ([ themeSelected, dark ]) => {
    /** On OS changes, our checkbox becomes indeterminate */
    darkCheckbox.indeterminate = !themeSelected

    /** Find or create our <meta name="color-scheme" content="..."> tag */
    let meta = document.querySelector('meta[name="color-scheme"]')
    if (! meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'color-scheme')
      document.head.appendChild(meta)
    }

    /** Force a specific theme ("light" or "dark") or use the OS default */
    const theme = themeSelected ? dark ? 'dark' : 'light' : 'light dark'
    meta.setAttribute('content', theme)
  }, { immediate: true })
})

/* Remember to remove our event listener on unmount */
onUnmounted(() => {
  query.removeEventListener('change', updateTheme)
})

</script>

<style scoped lang="pcss">
.demo {
  font-family: Arial, Helvetica, sans-serif;
}
.tiny-edit {
  margin-top: 10px;
  min-height: 3em;
}

pre {
  margin-top: 10px;
  min-height: 3em;
  padding: 3px;
}
</style>
