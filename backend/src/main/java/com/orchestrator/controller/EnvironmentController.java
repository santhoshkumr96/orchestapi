package com.orchestrator.controller;

import com.orchestrator.dto.*;
import com.orchestrator.model.EnvironmentFile;
import com.orchestrator.service.EnvironmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/environments")
@RequiredArgsConstructor
public class EnvironmentController {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("name", "baseUrl", "createdAt", "updatedAt");
    private static final int MAX_PAGE_SIZE = 100;

    private final EnvironmentService service;

    @GetMapping
    public PageResponse<EnvironmentResponse> findAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String baseUrl,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        if (!ALLOWED_SORT_FIELDS.contains(sortBy)) {
            sortBy = "name";
        }
        if (size < 1) size = 10;
        if (size > MAX_PAGE_SIZE) size = MAX_PAGE_SIZE;
        if (page < 0) page = 0;

        Sort sort = sortDir.equalsIgnoreCase("desc")
                ? Sort.by(sortBy).descending()
                : Sort.by(sortBy).ascending();
        return service.findAllPaged(name, baseUrl, PageRequest.of(page, size, sort));
    }

    @GetMapping("/{id}")
    public EnvironmentResponse findById(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    public ResponseEntity<EnvironmentResponse> create(@Valid @RequestBody EnvironmentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PutMapping("/{id}")
    public EnvironmentResponse update(@PathVariable UUID id, @Valid @RequestBody EnvironmentRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/test-connector")
    public TestConnectionResponse testConnector(@Valid @RequestBody TestConnectionRequest request) {
        return service.testConnection(request);
    }

    // ── File endpoints ──────────────────────────────────────────────────

    @PostMapping("/{id}/files")
    public ResponseEntity<EnvironmentFileResponse> uploadFile(
            @PathVariable UUID id,
            @RequestParam("fileKey") String fileKey,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.uploadFile(id, fileKey, file));
    }

    @GetMapping("/{id}/files")
    public List<EnvironmentFileResponse> listFiles(@PathVariable UUID id) {
        return service.listFiles(id);
    }

    @GetMapping("/{id}/files/{fileId}/download")
    public ResponseEntity<byte[]> downloadFile(@PathVariable UUID id, @PathVariable UUID fileId) {
        EnvironmentFile file = service.downloadFile(id, fileId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.getFileName() + "\"")
                .contentType(MediaType.parseMediaType(
                        file.getContentType() != null ? file.getContentType() : "application/octet-stream"))
                .contentLength(file.getFileSize())
                .body(file.getFileData());
    }

    @DeleteMapping("/{id}/files/{fileId}")
    public ResponseEntity<Void> deleteFile(@PathVariable UUID id, @PathVariable UUID fileId) {
        service.deleteFile(id, fileId);
        return ResponseEntity.noContent().build();
    }
}
