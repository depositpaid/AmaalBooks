const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const ARABIC_SCRIPT_PATTERN = /\p{Script=Arabic}/u;
const PAGE_STATUSES = new Set(['draft', 'in_review']);
const BLOCK_STATUSES = new Set(['draft', 'in_review']);
const DIRECTIONS = new Set(['ltr', 'rtl', 'auto']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  return true;
}

function requireString(value, path, errors, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    errors.push(`${path} must be a non-empty string`);
    return false;
  }
  return true;
}

function requireUuid(value, path, errors) {
  if (!requireString(value, path, errors) || !UUID_PATTERN.test(value)) {
    if (typeof value === 'string' && value.trim() !== '') errors.push(`${path} must be a UUID`);
    return false;
  }
  return true;
}

function requireNonNegativeInteger(value, path, errors) {
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${path} must be a non-negative integer`);
    return false;
  }
  return true;
}

function validateMetadata(payload, errors) {
  requireUuid(payload.bookId, 'bookId', errors);

  if (requireObject(payload.edition, 'edition', errors)) {
    requireUuid(payload.edition.id, 'edition.id', errors);
    requireString(payload.edition.editionLabel, 'edition.editionLabel', errors);
  }

  if (requireObject(payload.sourceDocument, 'sourceDocument', errors)) {
    requireUuid(payload.sourceDocument.id, 'sourceDocument.id', errors);
    requireString(payload.sourceDocument.originalFilename, 'sourceDocument.originalFilename', errors);
    if (
      payload.sourceDocument.sha256Checksum !== null &&
      payload.sourceDocument.sha256Checksum !== undefined &&
      !SHA256_PATTERN.test(payload.sourceDocument.sha256Checksum)
    ) {
      errors.push('sourceDocument.sha256Checksum must be null or a 64-character SHA-256 value');
    }
    if (
      payload.sourceDocument.pdfPageCount !== null &&
      payload.sourceDocument.pdfPageCount !== undefined &&
      (!Number.isInteger(payload.sourceDocument.pdfPageCount) || payload.sourceDocument.pdfPageCount <= 0)
    ) {
      errors.push('sourceDocument.pdfPageCount must be null or a positive integer');
    }
  }

  if (requireObject(payload.importBatch, 'importBatch', errors)) {
    requireUuid(payload.importBatch.id, 'importBatch.id', errors);
  }
}

function validatePage(page, pageIndex, errors) {
  const path = `pages[${pageIndex}]`;
  if (!requireObject(page, path, errors)) return;

  requireUuid(page.pageId, `${path}.pageId`, errors);
  if (typeof page.sourceShowsPrintedPageLabel !== 'boolean') {
    errors.push(`${path}.sourceShowsPrintedPageLabel must be boolean`);
  } else if (page.sourceShowsPrintedPageLabel) {
    requireString(page.printedPageLabel, `${path}.printedPageLabel`, errors);
  } else if (page.printedPageLabel !== null) {
    errors.push(`${path}.printedPageLabel must be null when the source shows no page label`);
  }
  if (
    page.printedPageNumber !== null &&
    page.printedPageNumber !== undefined &&
    !Number.isInteger(page.printedPageNumber)
  ) {
    errors.push(`${path}.printedPageNumber must be null or an integer explicitly printed by the source`);
  }
  if (!Number.isInteger(page.pdfPageNumber) || page.pdfPageNumber <= 0) {
    errors.push(`${path}.pdfPageNumber must be a positive integer`);
  }
  requireNonNegativeInteger(page.sequenceIndex, `${path}.sequenceIndex`, errors);
  if (!PAGE_STATUSES.has(page.verificationStatus)) {
    errors.push(`${path}.verificationStatus must be draft or in_review; imports cannot mark pages verified`);
  }

  const scanLanguages = Array.isArray(page.scanLanguages) ? page.scanLanguages : [];
  if (scanLanguages.length === 0 || scanLanguages.some((language) => typeof language !== 'string')) {
    errors.push(`${path}.scanLanguages must list the languages visibly present in the scan`);
  }

  if (!requireObject(page.reviewEvidence, `${path}.reviewEvidence`, errors)) return;
  for (const field of [
    'englishTranscriptionComplete',
    'arabicTranscriptionComplete',
    'blockOrderChecked',
    'identifiersChecked',
    'scanCompared',
  ]) {
    if (typeof page.reviewEvidence[field] !== 'boolean') {
      errors.push(`${path}.reviewEvidence.${field} must be boolean`);
    }
  }
  if (!page.reviewEvidence.blockOrderChecked) {
    errors.push(`${path}.reviewEvidence.blockOrderChecked must be true before import`);
  }
  if (!page.reviewEvidence.identifiersChecked) {
    errors.push(`${path}.reviewEvidence.identifiersChecked must be true before import`);
  }

  const nodes = Array.isArray(page.structuralNodes) ? page.structuralNodes : [];
  const nodeIds = new Set();
  const nodeSequences = new Set();
  nodes.forEach((node, nodeIndex) => {
    const nodePath = `${path}.structuralNodes[${nodeIndex}]`;
    if (!requireObject(node, nodePath, errors)) return;
    if (requireUuid(node.id, `${nodePath}.id`, errors)) nodeIds.add(node.id);
    requireString(node.nodeType, `${nodePath}.nodeType`, errors);
    requireNonNegativeInteger(node.sequenceIndex, `${nodePath}.sequenceIndex`, errors);
    if (nodeSequences.has(node.sequenceIndex)) {
      errors.push(`${nodePath}.sequenceIndex is duplicated`);
    }
    nodeSequences.add(node.sequenceIndex);
    for (const field of ['sourceLabel', 'sourceIdentifier', 'title']) {
      if (node[field] !== null && node[field] !== undefined) {
        requireString(node[field], `${nodePath}.${field}`, errors);
      }
    }
    if (node.parentId !== null && node.parentId !== undefined) {
      requireUuid(node.parentId, `${nodePath}.parentId`, errors);
      if (!nodeIds.has(node.parentId)) {
        errors.push(`${nodePath}.parentId must reference an earlier node in the same page payload`);
      }
    }
  });

  if (!Array.isArray(page.blocks) || page.blocks.length === 0) {
    errors.push(`${path}.blocks must contain the complete ordered transcription for the page`);
    return;
  }

  const blockIds = new Set();
  const blockSequences = new Set();
  let previousSequence = -1;
  let hasArabicBlock = false;
  let hasEnglishBlock = false;

  page.blocks.forEach((block, blockIndex) => {
    const blockPath = `${path}.blocks[${blockIndex}]`;
    if (!requireObject(block, blockPath, errors)) return;
    if (requireUuid(block.id, `${blockPath}.id`, errors)) {
      if (blockIds.has(block.id)) errors.push(`${blockPath}.id is duplicated`);
      blockIds.add(block.id);
    }
    requireString(block.blockType, `${blockPath}.blockType`, errors);
    const hasLanguageCode = requireString(
      block.languageCode,
      `${blockPath}.languageCode`,
      errors
    );
    requireString(block.textContent, `${blockPath}.textContent`, errors);
    requireNonNegativeInteger(block.sequenceIndex, `${blockPath}.sequenceIndex`, errors);
    if (blockSequences.has(block.sequenceIndex)) {
      errors.push(`${blockPath}.sequenceIndex is duplicated`);
    }
    blockSequences.add(block.sequenceIndex);
    if (block.sequenceIndex <= previousSequence) {
      errors.push(`${blockPath}.sequenceIndex must follow exact payload/source order`);
    }
    previousSequence = block.sequenceIndex;
    if (!DIRECTIONS.has(block.direction)) {
      errors.push(`${blockPath}.direction must be ltr, rtl, or auto`);
    }
    if (!BLOCK_STATUSES.has(block.verificationStatus)) {
      errors.push(`${blockPath}.verificationStatus must be draft or in_review`);
    }
    if (typeof block.ttsEligible !== 'boolean') {
      errors.push(`${blockPath}.ttsEligible must be boolean`);
    }
    if (block.rawOcrText !== null && block.rawOcrText !== undefined && typeof block.rawOcrText !== 'string') {
      errors.push(`${blockPath}.rawOcrText must be null or a string kept separately from textContent`);
    }
    if (block.structuralNodeId !== null && block.structuralNodeId !== undefined) {
      requireUuid(block.structuralNodeId, `${blockPath}.structuralNodeId`, errors);
      if (!nodeIds.has(block.structuralNodeId)) {
        errors.push(`${blockPath}.structuralNodeId must reference a node supplied with this atomic page`);
      }
    }

    if (block.blockType === 'arabic') {
      hasArabicBlock = true;
      if (block.direction !== 'rtl') errors.push(`${blockPath}.direction must be rtl for Arabic`);
      if (!hasLanguageCode || !block.languageCode.toLowerCase().startsWith('ar')) {
        errors.push(`${blockPath}.languageCode must identify Arabic`);
      }
      if (!ARABIC_SCRIPT_PATTERN.test(block.textContent)) {
        errors.push(`${blockPath}.textContent must contain actual Unicode Arabic script`);
      }
    }
    if (hasLanguageCode && block.languageCode.toLowerCase().startsWith('en')) {
      hasEnglishBlock = true;
    }
  });

  const scanHasArabic = scanLanguages.some(
    (language) => typeof language === 'string' && language.toLowerCase().startsWith('ar')
  );
  const scanHasEnglish = scanLanguages.some(
    (language) => typeof language === 'string' && language.toLowerCase().startsWith('en')
  );
  if (scanHasArabic && (!hasArabicBlock || !page.reviewEvidence.arabicTranscriptionComplete)) {
    errors.push(`${path} declares visible Arabic but lacks a complete Unicode Arabic transcription`);
  }
  if (scanHasEnglish && (!hasEnglishBlock || !page.reviewEvidence.englishTranscriptionComplete)) {
    errors.push(`${path} declares visible English but lacks a complete English transcription`);
  }
}

export function validateStructuredImport(payload) {
  const errors = [];
  if (!requireObject(payload, 'payload', errors)) return { valid: false, errors };
  if (payload.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!['demo', 'production'].includes(payload.datasetKind)) {
    errors.push('datasetKind must be demo or production');
  }
  validateMetadata(payload, errors);
  if (!Array.isArray(payload.pages) || payload.pages.length === 0) {
    errors.push('pages must contain at least one complete page');
  } else {
    const pageIds = new Set();
    const pageSequences = new Set();
    payload.pages.forEach((page, index) => {
      validatePage(page, index, errors);
      if (isObject(page)) {
        if (pageIds.has(page.pageId)) errors.push(`pages[${index}].pageId is duplicated`);
        pageIds.add(page.pageId);
        if (pageSequences.has(page.sequenceIndex)) errors.push(`pages[${index}].sequenceIndex is duplicated`);
        pageSequences.add(page.sequenceIndex);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidStructuredImport(payload) {
  const result = validateStructuredImport(payload);
  if (!result.valid) {
    throw new Error(`Structured import validation failed:\n- ${result.errors.join('\n- ')}`);
  }
  return payload;
}
