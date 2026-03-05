<?php
// Returns typing texts collected from ./data/type_master/texts/*.txt|*.md
// This enables "drop a new file to add new text" without a build step.

header('Content-Type: application/json; charset=utf-8');

$dir = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'type_master' . DIRECTORY_SEPARATOR . 'texts';
$allowed = array('txt' => true, 'md' => true);
$texts = array();

if (is_dir($dir)) {
  $entries = scandir($dir);
  if ($entries !== false) {
    foreach ($entries as $name) {
      if ($name === '.' || $name === '..') continue;
      $path = $dir . DIRECTORY_SEPARATOR . $name;
      if (!is_file($path)) continue;

      $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
      if (!isset($allowed[$ext])) continue;

      $content = @file_get_contents($path);
      if ($content === false) continue;

      // Normalize newlines and trim.
      $content = preg_replace("/\\r\\n?/", "\n", $content);
      $content = trim($content);
      if ($content === '') continue;

      $texts[] = $content;
    }
  }
}

echo json_encode(array('texts' => $texts), JSON_UNESCAPED_UNICODE);

