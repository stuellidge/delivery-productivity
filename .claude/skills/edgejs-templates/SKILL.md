---
name: edgejs-templates
description: >
  Create Edge.js templates for AdonisJS v6 including layouts, components, slots,
  partials, conditionals, loops, interpolation, helpers, and stacks. Use when
  building server-rendered views, creating reusable components, working with .edge
  template files, or rendering HTML in AdonisJS applications.
---

# Edge.js Templates (AdonisJS v6)

## Critical: v6 Syntax Changes

Edge.js v6 replaced several APIs. If using legacy code, note:

- `@set` → `@let` (define) and `@assign` (update)
- `{{ e(value) }}` → `{{ html.escape(value) }}`
- `{{ safe(value) }}` → `{{ html.safe(value) }}`
- `{{ stringify(obj) }}` → `{{ js.stringify(obj) }}`
- `$props.serialize()` → `$props.toAttrs()`
- `$props.serializeExcept([])` → `$props.except([]).toAttrs()`

## Interpolation

```edge
{{-- Double curly braces evaluate JavaScript expressions --}}
{{ username }}
{{ user.username.toUpperCase() }}
{{ (2 + 2) * 3 }}
{{ (await getUser()).username }}
{{-- Triple curly braces output raw HTML (unescaped) --}}
{{{ markdownToHtml(post.body) }}}
{{-- Comments (not rendered in output) --}}
{{-- This is a comment --}}
```

## Variables

```edge
{{-- Define a variable --}}
@let(title = 'Hello World')
@let(payments = await user.getPayments())

{{-- Update an existing variable --}}
@assign(title = 'Updated Title')

{{-- Mutate object properties --}}
@assign(user.name = 'New Name')
```

## Conditionals

```edge
@if(user.isAdmin)
  <p>
    Welcome, admin!
  </p>
@elseif(user.isEditor)
  <p>
    Welcome, editor!
  </p>
@else
  <p>
    Welcome, guest!
  </p>
@end

{{-- Unless (inverse of if) --}}
@unless(user.isGuest)
  <a href="/dashboard">Dashboard</a>
@end
```

## Loops

```edge
{{-- Array iteration --}}
@each(post in posts)
  <h2>
    {{ post.title }}
  </h2>
  <p>
    {{ post.body }}
  </p>
@end

{{-- With index --}}
@each((post, index) in posts)
  <p>
    {{ index + 1 }}. {{ post.title }}
  </p>
@end

{{-- Empty state --}}
@each(post in posts)
  <h2>
    {{ post.title }}
  </h2>
@else
  <p>
    No posts found.
  </p>
@end
```

## Layouts

Define a layout in `resources/views/layouts/app.edge`:

```edge
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>
      {{ title ?? 'Default Title' }}
    </title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @stack('head')
  </head>
  <body>
    @slot('header')
      <header>
        Default header
      </header>
    @end
    
    @slot('main')
    @end
    
    @slot('footer')
      <footer>
        Default footer
      </footer>
    @end
    
    @stack('js')
  </body>
</html>
```

Use the layout in a page (use `@component`, NOT `@layout.app()`):

```edge
@component('layouts/app', { title: 'My Page' })
  @slot('main')
    <h1>
      Hello world
    </h1>
    <p>
      Page content here.
    </p>
  @end
@end
```

## Partials

```edge
{{-- Include a partial --}}
@include('partials/header')

<main>
  Content
</main>

@include('partials/footer')

{{-- Conditional include --}}
@includeIf(post.hasComments, 'partials/comments')
```

## Components

### Define a Component

File: `resources/views/components/button.edge`

```edge
<button {{ $props.except(['text']).toAttrs() }}>
  {{ text }}
</button>
```

### Use a Component

```edge
{{-- Self-closing (no children) --}}
@!component('components/button', { text: 'Login', type: 'submit', class: 'btn-primary' })

{{-- As a tag (preferred) --}}
@!button({ text: 'Login', type: 'submit' })

{{-- With children/slots --}}
@button({ class: 'btn-primary' })
  <i class="fa-lock"></i>
  <span>Login</span>
@end
```

### Component Props API

```edge
{{-- Get a specific prop --}}
{{ $props.get('text') }}
{{-- Render all props as HTML attributes --}}
{{ $props.toAttrs() }}
{{-- Exclude specific props from attributes --}}
{{ $props.except(['text', 'icon']).toAttrs() }}
{{-- Include only specific props --}}
{{ $props.only(['class', 'id']).toAttrs() }}
{{-- Merge with defaults --}}
{{ $props.merge({ class: 'btn' }).toAttrs() }}
```

## Slots

### Define slots in a component

File: `resources/views/components/card.edge`

```edge
<div class="card">
  <div class="card-header">
    {{{ await $slots.header() }}}
  </div>
  <div class="card-body">
    {{{ await $slots.main() }}}
  </div>
  @if($slots.footer)
    <div class="card-footer">
      {{{ await $slots.footer() }}}
    </div>
  @end
</div>
```

### Use slots

```edge
@card()
  @slot('header')
    <h2>
      Card Title
    </h2>
  @end
  
  @slot('main')
    <p>
      Card content goes here.
    </p>
  @end
  
  @slot('footer')
    <button>Action</button>
  @end
@end
```

## Stacks

Stacks collect content from child templates/components for injection into layouts:

```edge
{{-- In layout: define where stack content renders --}}
@stack('js')

{{-- In page/component: push content to a stack --}}
@pushOnceTo('js')
  <script src="/app.js"></script>
@end

{{-- pushTo allows duplicates; pushOnceTo deduplicates --}}
@pushTo('js')
  <script>console.log('this may appear multiple times')</script>
@end
```

## Helpers

```edge
{{-- Excerpt: strip HTML, truncate --}}
{{ excerpt(post.body, 200) }}
{{ excerpt(post.body, 200, { suffix: '... [Read more]' }) }}
{{-- Escape HTML --}}
{{ html.escape(userInput) }}
{{-- Raw HTML (unescaped) --}}
{{{ html.safe(trustedHtml) }}}
{{-- JSON in templates --}}
{{ js.stringify(data) }}
```

## Forms

### CSRF Protection

Always include `{{ csrfField() }}` in forms:

```edge
<form method="POST" action="{{ route('posts.store') }}">
  {{ csrfField() }}
  <input type="text" name="title" value="{{ flashMessages.get('title', '') }}" />
  <button type="submit">Create</button>
</form>
```

### Method Spoofing

AdonisJS v6 requires `_method` in the **URL query string**, not as a hidden form field:

```edge
{{-- ✅ Correct --}}
<form method="POST" action="{{ route('posts.update', { id: post.id }) }}?_method=PUT">
  {{ csrfField() }}
</form>

<form method="POST" action="{{ route('posts.destroy', { id: post.id }) }}?_method=DELETE">
  {{ csrfField() }}
</form>

{{-- ❌ Wrong — hidden field is ignored --}}
<form method="POST" action="{{ route('posts.update', { id: post.id }) }}">
  <input type="hidden" name="_method" value="PUT" />
</form>
```

### Flash Messages

```edge
{{-- Display flash messages --}}
@if(flashMessages.has('success'))
  <div class="flash-success" role="alert">
    {{ flashMessages.get('success') }}
  </div>
@end

@if(flashMessages.has('error'))
  <div class="flash-error" role="alert">
    {{ flashMessages.get('error') }}
  </div>
@end

{{-- Repopulate form fields with old input --}}
<input type="text" name="title" value="{{ flashMessages.get('title', '') }}" />

{{-- Display validation errors --}}
@if(flashMessages.has('errors.title'))
  <small>{{ flashMessages.get('errors.title') }}</small>
@end
```

### Form Validation Error Display

```edge
<label for="title">Title</label>
<input
  type="text"
  name="title"
  id="title"
  value="{{ flashMessages.get('title', '') }}"
  {{ flashMessages.has('errors.title') ? 'aria-invalid="true"' : '' }}
/>
@if(flashMessages.has('errors.title'))
  <small>{{ flashMessages.get('errors.title') }}</small>
@end
```

## Rendering from Controllers

```typescript
import type { HttpContext } from '@adonisjs/core/http'

export default class PostsController {
  async index({ view }: HttpContext) {
    const posts = await Post.query().orderBy('createdAt', 'desc')
    return view.render('posts/index', { posts })
  }

  async show({ params, view }: HttpContext) {
    const post = await Post.findOrFail(params.id)
    return view.render('posts/show', { post })
  }
}
```

## Global State

Share data available to all templates:

```typescript
// In a preload file or service provider
import edge from 'edge.js'

edge.global('config', {
  appName: 'My App',
  colorScheme: 'dark',
})
```

## Common Pitfalls

### `$loop.last` does not work in `@each`

Use index-based comparison instead:

```edge
@each((item, index) in items)
  {{ item.name }}{{ index < items.length - 1 ? ', ' : '' }}
@end
```

### Arrow functions don't work in Edge.js template expressions

```edge
{{-- ❌ WRONG — arrow functions fail silently --}}
{{ items.filter(i => i.active).length }}
{{ items.map(i => i.name).join(', ') }}
{{-- ✅ CORRECT — use @each/@if, or compute in controller --}}
```

### `@let` variables are not accessible inside `@each` within component slots

Variables defined with `@let` in a component slot are not visible inside `@each`
loops due to scoping. Instead, pass pre-computed data from the controller as view
variables.

```typescript
// In controller — compute selected IDs here
const selectedTagIds = post.tags.map((t) => t.id)
return view.render('posts/edit', { post, tags, selectedTagIds })
```

```edge
{{-- In template — use the controller-provided variable --}}
@each(tag in tags)
  <option value="{{ tag.id }}" {{ selectedTagIds.includes(tag.id) ? 'selected' : '' }}>
    {{ tag.name }}
  </option>
@end
```

## File Conventions

- Templates live in `resources/views/`
- Use `.edge` extension
- Subdirectories map to slash notation: `posts/index.edge` → `view.render('posts/index')`
- Components in `resources/views/components/`
- Layouts in `resources/views/layouts/`
- Partials in `resources/views/partials/`

## Vite Integration

Use the `@vite()` tag to include CSS and JS assets processed by Vite:

```edge
{{-- In layout head --}}
@vite(['resources/css/app.css', 'resources/js/app.js'])
```

Install CSS frameworks via npm and import through your bundler, not via CDN:

```css
/* resources/css/app.css */
@import '@picocss/pico';

/* Your custom styles below */
```

## Further Reference

For custom tags, the Iconify plugin, Markdown plugin, or advanced component patterns
not covered here, use the Context7 MCP server with `context7-compatible-id: edgejs_dev`.
