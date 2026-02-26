package com.orchestrator.repository;

import com.orchestrator.model.EnvironmentFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EnvironmentFileRepository extends JpaRepository<EnvironmentFile, UUID> {

    List<EnvironmentFile> findByEnvironmentId(UUID environmentId);

    Optional<EnvironmentFile> findByEnvironmentIdAndFileKey(UUID environmentId, String fileKey);

    Optional<EnvironmentFile> findByIdAndEnvironmentId(UUID id, UUID environmentId);
}
