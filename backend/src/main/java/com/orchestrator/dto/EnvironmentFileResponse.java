package com.orchestrator.dto;

import com.orchestrator.model.EnvironmentFile;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnvironmentFileResponse {

    private UUID id;
    private String fileKey;
    private String fileName;
    private String contentType;
    private long fileSize;
    private LocalDateTime createdAt;

    public static EnvironmentFileResponse from(EnvironmentFile file) {
        return EnvironmentFileResponse.builder()
                .id(file.getId())
                .fileKey(file.getFileKey())
                .fileName(file.getFileName())
                .contentType(file.getContentType())
                .fileSize(file.getFileSize())
                .createdAt(file.getCreatedAt())
                .build();
    }
}
